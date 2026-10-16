// @bun
import {
  isPublicUnicastAddress,
  parseIpv4,
  parseIpv6
} from "./index-nw10kds5.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/capture-error.ts
function captureError(code = "unknown") {
  return { schemaVersion: 1, code, retryable: code === "transient" || code === "rate-limited" || code === "timeout" };
}

// src/pdf-auth.ts
import { chmodSync, closeSync, existsSync, mkdtempSync, openSync, rmSync, statSync, writeSync } from "fs";
import { homedir, tmpdir } from "os";
import { basename, isAbsolute, join, resolve } from "path";
import { cookieSources } from "@hraness/wordcell/clip/args";

// src/usage.ts
var GHOSTGET_DESCRIPTION = `GhostGet gives your AI agent named web actions: read a page, archive one
media item, or use a connected account, without credentials or a browser to
steer.`;
var ghostgetUsage = `Usage: ghostget <command> [options]

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

Control GhostGet
  ghostget status                     Accounts, approvals and saved outputs
  ghostget tui                        Open the keyboard control panel
  ghostget control serve|stop         Run the control owner without a window
  ghostget approvals|permissions|connections
                                      Every control action as a command
  ghostget doctor                     Check everything GhostGet needs
  ghostget update [check|status]       Update the installed CLI or inspect it

Extend GhostGet
  ghostget adapter|plugin|contracts   Add and check site support
  ghostget derive                     Record a site's API from a browser
  ghostget web|interface|platforms    Web rules, API drafts, site policy

Messaging and exports
  ghostget messaging|beeper|whatsapp|imessage|apple-photos [options]

Options
  -h, --help                          Show help for any command
  -V, --version                       Print the version
  --json                              Print machine-readable output

More: ghostget help <command> \xB7 ghostget help policy \xB7 ghostget help advanced
Optional support: ghostget support \xB7 Turn off: HRANESS_SUPPORT=off
`;
var readHelp = `Usage: ghostget read <url> [options]

Read a page and print it as Markdown. Nothing is saved.

Options
  --auth <id>                    Read with a connected account
  --mode auto|http|browser|file  How to fetch the page (default: auto)
  --browser-engine auto|chrome|lightpanda
                                 Public text browser; auto prefers Lightpanda
  --browser-profile <name|path>  Use a signed-in Chrome profile
  --cookie-source <browser>      chrome|arc|brave|chromium|edge|firefox|safari
  --cookie-profile <name|path>   Which profile of that browser
  --cookies-file <path>          Use exported cookies instead of a browser
  --json                         Print machine-readable output
  --timeout-ms <n>               Stop waiting after this many milliseconds

Example
  ghostget read https://example.com
`;
var clipHelp = `Usage: ghostget clip <url> [slug] [options]
       ghostget <url> [slug] [options]

Save a page as a Markdown note in your notes folder.

Options
  --auth <id>                    Save with a connected account
  --output <directory>           Where to save (default: kb/articles)
  --media none|images|all        Save images or all supported media
  --evidence none|source|screenshot|all
                                 Keep the page source or a screenshot
  --browser-engine auto|chrome|lightpanda
                                 Public text browser; auto prefers Lightpanda
  --stdout                       Print Markdown instead of saving
  --force                        Replace an existing note
  --json                         Print machine-readable output

Capture options from ghostget read --help also apply.

Example
  ghostget clip https://example.com example-page
`;
var authHelp = `Usage: ghostget auth <list|add|bind|remove|login|pair|sync> [options]

Connect accounts you're already signed in to. GhostGet reads the sign-in
from your browser when it needs it and never stores your password.

Commands
  auth list                          List connected accounts
  auth add <id> --cookie-source <browser> [--cookie-profile <name>]
                                     Connect from a browser profile
  auth add <id> --cookies-file <path>
                                     Connect from exported cookies
  auth add <id> --browser-profile <name|path> --trust-profile-egress
                                     Use a whole Chrome profile
                [--storage-state <path>]
                                     Seed page storage (cookies + localStorage)
                                     from a saved storage-state file instead of
                                     cloning the profile; providers whose
                                     sessions live in localStorage need this
  auth add <id> --oauth-provider <site> --token-file <path> --scopes <list>
  auth add <id> --linked-device <site> [--device-store <directory>]
  auth bind <id> --site <site> [--force]
                                     Check which account is signed in
  auth login <id> --client-file <desktop-client.json> [--no-open]
                                     Connect Google with your own OAuth app
  auth pair <id> [--phone <number>]  Pair a linked device
  auth sync <id> --once              Refresh a linked device's local copy
  auth remove <id> --yes             Remove an account from GhostGet

Options
  --subject <account-id>             Expect this account
  --force                            Replace an existing account
  --json                             Print machine-readable output

Example
  ghostget browsers
  ghostget auth add x-main --cookie-source chrome --cookie-profile Default
  ghostget auth bind x-main --site x
`;
var browsersHelp = `Usage: ghostget browsers [--json]

List browsers and profiles on this Mac that GhostGet can read a sign-in
from, with the flags to paste into ghostget auth add.

Options
  --json                             Print machine-readable output

Example
  ghostget browsers
`;
var capabilitiesHelp = `Usage: ghostget capabilities [adapter] [--json]

List the actions installed adapters offer. An adapter is GhostGet's support
for one site, such as x-web.

Options
  --json                             Print machine-readable output

Example
  ghostget adapter sync-bundled
  ghostget capabilities x-web
`;
var invokeHelp = `Usage: ghostget invoke <adapter> <action> [options]
       ghostget <adapter> <action> [options]

Run one action from ghostget capabilities. Reads run right away. Changes,
such as posting, print a preview first; run ghostget confirm <digest> to
make the change once. An observed posts.publish or media.publish can instead
run one durable dispatch directly with --execute; the same account permission
fence applies (managed Ask or Deny refuses).

Options
  --input <json|@file|->             Action input
  --auth <id>                        Connected account to use
  --preview                          Show the change without making it
  --execute                          Execute an owner-allowed publication once
  --cache-only                       Return the last saved result only
  --headed                           Show the browser window if one is used
  --json                             Print machine-readable output

Example
  ghostget invoke x-web timeline.read --auth x-main
`;
var confirmHelp = `Usage: ghostget confirm <digest> [--headed] [--json]

Make a previewed change once. Previews expire after five minutes.

Related
  ghostget plans list                List previews waiting for confirmation
  ghostget plans cancel <digest> --yes
                                     Drop a preview
  ghostget runs list                 List finished runs
  ghostget runs show <run-id>        Show one run
  ghostget runs reconcile <run-id>   Settle a run whose result was unclear
`;
var omniHelp = `Usage: ghostget omni read --input <json|@file|-> [options]

Read your inboxes from several connected sites as one list.

Options
  --cache-only                       Return the saved view without new reads
  --from-exact-cache                 Rebuild from saved reads only
  --identity-only                    Print only the query identity
  --headed                           Show the browser window if one is used
  --json                             Print machine-readable output
`;
var doctorHelp = `Usage: ghostget doctor [--json]

Check that capture, media, accounts and actions have what they need, and
say what to fix.

Options
  --json                             Print machine-readable output
`;
var loginHelp = `Usage: ghostget login [--json]
       ghostget logout [--json]

Sign in to Hraness Accounts for product updates and optional support. You
don't need this to connect sites; use ghostget auth add for that.
`;
var adapterHelp = `Usage: ghostget adapter <command> [options]

Adapters are GhostGet's reviewed support for one site.

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
var pluginHelp = `Usage: ghostget plugin <command> [options]

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
var contractsHelp = `Usage: ghostget contracts <catalog|check|repair|schema> [options]

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
var deriveHelp = `Usage: ghostget derive <command> [options]

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
var messagingHelp = `Usage: ghostget <messaging|beeper|whatsapp|imessage|apple-photos> ...

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
var threadHelp = `Usage: ghostget thread <split|publish> <site> [options]

Split long text into a thread, or publish one after a preview.

Commands
  thread split <site> --text <text|@file|-> [--json]
  thread publish <site> --adapter <id> --text <text|@file|-> --auth <id>
                 [--preview] [--headed] [--json]
`;
var platformsHelp = `Usage: ghostget platforms [site] [--json]

Show the reviewed policy for each supported site: what GhostGet may read or
change there. This lists policy, not installed adapters.
`;
var notesHelp = `Usage: ghostget <command> [options]

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

Paywalled PDFs
  Add the browser you use to open the paper, and GhostGet downloads it
  with that sign-in:
    ghostget pdf <url> --cookie-source chrome
  Also: --browser-profile <name|path>, --cookie-profile <name>,
  --auth <id> or --cookies-file <path>. Each site gets only its own cookies.
  If the site sends a sign-in page instead, open the link in your browser
  first, then run it again.
`;
var supportHelp = `Usage: ghostget support [--json]

See optional product updates and ways to support GhostGet. Nothing is paid
or signed up for through these commands.

Commands
  support                            Show updates and support options
  support dismiss|snooze|enable      Stop, pause or restore invitations
  support status --json              Show your invitation settings

Agent commands moved to ghostget help advanced.

Turn off: HRANESS_SUPPORT=off
`;
var policyHelp = `GhostGet policy

Risk levels
  R1 reads run right away. R2 and R3 changes make a preview that lasts five
  minutes; ghostget confirm <digest> makes the change once. R4 is blocked.
  Signed-in actions use each site's own API. GhostGet never runs arbitrary
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
  GhostGet runs at most two browsers of its own at a time for page capture,
  shared by every process that uses the same state folder. A capture waits
  up to 30 seconds for a free browser. Attaching to your own browser with
  --browser-live or --cdp doesn't count. ghostget doctor --json shows the
  state folder.

Updates and support
  After useful work, GhostGet may print one short line on stderr about
  updates or support. Output and exit codes don't change. Agents read
  ghostget support protocol --json once, then check
  ghostget support offer --json at the end of a task with a person.
  HRANESS_SUPPORT_AUDIENCE=agent|human|off picks who sees it (default:
  agent). HRANESS_SUPPORT=off turns it off; ghostget support dismiss opts out.

Telemetry
  Each run sends one ping with the product name and version to Hraness
  Accounts. Arguments, paths, account data and output never leave the machine.
  A token made on this machine counts daily active installs only.
  HRANESS_TELEMETRY=off or GHOSTGET_TELEMETRY=off turns it off.
`;
var advancedHelp = `GhostGet advanced commands

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

The TUI uses a running control owner (ghostget control serve) when there
is one. Setup guide: https://ghostget.com/getting-started
`;
var updateHelp = `Usage: ghostget update [check|status|enable|disable] [--json]

Supported global Bun and npm installs on macOS and Linux update before ordinary
commands, at most once a day.
Use check to inspect the latest release, status for saved settings, disable to
stop automatic updates, or enable to resume them. Exact version pins require
enable before tracking new releases. Install the GitHub CLI (gh), then run
gh auth login --hostname github.com to authenticate it for verified downloads.
An older CLI without update needs the documented global install command once.

HRANESS_NO_UPDATE=1 skips automatic updates for one command. CI, nested clients,
gateway-only mode, help, and version do not check for updates automatically.
Manage project dependencies, source checkouts, and other installs with their
package manager.
`;
var HELP_TOPICS = {
  update: { text: updateHelp },
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
  advanced: { advanced: advancedHelp },
  help: { text: ghostgetUsage },
  menubar: { delegate: "menubar" },
  tui: { delegate: "tui" },
  status: { delegate: "status" },
  approvals: { delegate: "approvals" },
  activity: { delegate: "activity" },
  prompt: { delegate: "prompt" },
  outputs: { delegate: "outputs" },
  connections: { delegate: "connections" },
  control: { delegate: "control" },
  permissions: { delegate: "permissions" },
  commands: { delegate: "commands" },
  vault: { delegate: "vault" },
  web: { delegate: "web" },
  interface: { delegate: "interface" },
  media: { delegate: "media" },
  archive: { delegate: "media" },
  audio: { delegate: "media" },
  video: { delegate: "media" },
  transcript: { delegate: "media" },
  verify: { delegate: "media" },
  transcriber: { delegate: "media" }
};
var SELF_HELP_COMMANDS = new Set([
  "menubar",
  "tui",
  "vault",
  "web",
  "interface",
  "url-metadata",
  "media",
  "archive",
  "audio",
  "video",
  "transcript",
  "verify",
  "transcriber"
]);
var PDF_SIGN_IN_OPTIONS = new Set([
  "--auth",
  "--browser-profile",
  "--cookie-source",
  "--cookie-profile",
  "--cookies-file"
]);
function hasPdfSignInOptions(pdfArguments) {
  const separator = pdfArguments.indexOf("--");
  const scanned = separator === -1 ? pdfArguments : pdfArguments.slice(0, separator);
  return scanned.some((argument) => PDF_SIGN_IN_OPTIONS.has(argument.split("=", 1)[0] ?? ""));
}
var GHOSTGET_COMMAND_NAMES = Object.freeze(Object.keys(HELP_TOPICS).filter((name) => !["help", "permissions", "keychain", "policy", "advanced", "notes"].includes(name)));
var REGISTRY_WORDS = new Set([
  "commands",
  "status",
  "approvals",
  "permissions",
  "activity",
  "prompt",
  "outputs",
  "connections",
  "control"
]);

// src/pdf-auth.ts
var PDF_AUTH_DEFAULTS = Object.freeze({
  timeoutMs: 120000,
  maxPdfBytes: 512 * 1024 * 1024,
  maxRedirects: 5
});
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

class PdfAuthError extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "PdfAuthError";
    this.code = code;
  }
}
function usage(message) {
  return new PdfAuthError("usage", message);
}
function isCookieSource(value) {
  return cookieSources.includes(value);
}
function splitPdfSignInArguments(pdfArguments) {
  const remaining = [];
  const values = new Map;
  const readOnly = [];
  for (let index = 0;index < pdfArguments.length; index += 1) {
    const argument = pdfArguments[index] ?? "";
    if (argument === "--") {
      remaining.push(...pdfArguments.slice(index));
      break;
    }
    const equals = argument.indexOf("=");
    const name = argument.startsWith("--") && equals !== -1 ? argument.slice(0, equals) : argument;
    if (argument === "--trust-profile-egress") {
      readOnly.push(argument);
      continue;
    }
    if (name === "--mode") {
      const mode = name !== argument ? argument.slice(equals + 1) : pdfArguments[index + 1];
      if (name === argument)
        index += 1;
      readOnly.push(name, mode ?? "");
      continue;
    }
    if (!PDF_SIGN_IN_OPTIONS.has(name)) {
      remaining.push(argument);
      continue;
    }
    let value;
    if (name !== argument) {
      value = argument.slice(equals + 1);
    } else {
      value = pdfArguments[index + 1];
      index += 1;
    }
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw usage(`${name} needs a value`);
    }
    if (values.has(name))
      throw usage(`${name} can be given only once`);
    values.set(name, value);
  }
  if (values.size === 0) {
    if (readOnly.length === 0)
      return { signIn: null, remaining };
    return { signIn: null, remaining: [...pdfArguments] };
  }
  for (let index = 0;index < readOnly.length; index += 1) {
    if (readOnly[index] !== "--mode")
      continue;
    const mode = readOnly[index + 1];
    if (mode !== "browser" && mode !== "http") {
      throw usage("--mode must be browser or http; a signed-in PDF download needs neither, so you can leave it out");
    }
  }
  const authId = values.get("--auth");
  const browserProfile = values.get("--browser-profile");
  const cookieSource = values.get("--cookie-source");
  const cookieProfile = values.get("--cookie-profile");
  const cookiesFile = values.get("--cookies-file");
  if (authId !== undefined) {
    if (browserProfile !== undefined || cookieSource !== undefined || cookieProfile !== undefined || cookiesFile !== undefined) {
      throw usage("--auth cannot be combined with --browser-profile, --cookie-source, --cookie-profile or --cookies-file");
    }
    return { signIn: { kind: "auth", id: authId }, remaining };
  }
  if (cookiesFile !== undefined) {
    if (browserProfile !== undefined || cookieSource !== undefined || cookieProfile !== undefined) {
      throw usage("--cookies-file cannot be combined with a browser or browser profile");
    }
    return { signIn: { kind: "cookies-file", path: cookiesFile }, remaining };
  }
  if (cookieSource !== undefined && !isCookieSource(cookieSource)) {
    throw usage(`--cookie-source must be one of ${cookieSources.join(", ")}`);
  }
  if (browserProfile !== undefined && cookieProfile !== undefined) {
    throw usage("use either --browser-profile or --cookie-profile, not both");
  }
  if (cookieSource === undefined && browserProfile === undefined) {
    throw usage(cookieProfile !== undefined ? "--cookie-profile needs --cookie-source, for example --cookie-source chrome" : "say which browser is signed in, for example --cookie-source chrome");
  }
  return {
    signIn: {
      kind: "browser",
      source: cookieSource ?? "chrome",
      profile: browserProfile ?? cookieProfile
    },
    remaining
  };
}
var COOKIE_FILE_NO_MATCH = "the explicitly selected cookie file contained no usable cookies for this request";
function isNoMatchingCookies(error) {
  const message = error instanceof Error ? error.message : "";
  return message.startsWith("no matching cookies were found") || message.startsWith("no usable origin-scoped cookies were found") || message.startsWith("the managed Chromium profile contained no usable origin-scoped cookies") || message === COOKIE_FILE_NO_MATCH;
}
function browserLabel(signIn, auth) {
  const source = signIn?.kind === "browser" ? signIn.source : auth?.kind === "cookie-source" ? auth.source : auth?.kind === "browser-profile" ? auth.cookieSource ?? "chrome" : undefined;
  if (source === undefined)
    return "browser";
  const names = {
    chrome: "Chrome",
    arc: "Arc",
    brave: "Brave",
    chromium: "Chromium",
    edge: "Edge",
    firefox: "Firefox",
    safari: "Safari"
  };
  return names[source] ?? "browser";
}
function noAccessMessage(browser) {
  return `the site sent a web page instead of the PDF, so your ${browser} sign-in does not seem to have access to it. ` + `Open the link in ${browser}, sign in through your library or university if it asks, check that the PDF opens there, then run this again`;
}
function noSignInMessage(browser, host) {
  return `no ${browser} sign-in was found for ${host}, so the site sent a sign-in page instead of the PDF. ` + `Check that you chose the browser and profile you use for this site (ghostget browsers lists them), ` + `or open the link in ${browser}, sign in, then run this again`;
}
function refused(browser, host, signedIn) {
  return signedIn ? new PdfAuthError("access", noAccessMessage(browser)) : new PdfAuthError("no-sign-in", noSignInMessage(browser, host));
}
function readableSize(bytes) {
  if (bytes < 1024 * 1024)
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const value = bytes / (1024 * 1024);
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} MB`;
}
function tooLarge(maxBytes) {
  return new PdfAuthError("download", `the PDF is larger than the ${readableSize(maxBytes)} limit. Pass a larger --max-pdf-bytes to allow it`);
}
function contentTypeEssence(response) {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
function looksLikeHtml(bytes, contentType) {
  if (contentType === "text/html" || contentType === "application/xhtml+xml")
    return true;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512)).replace(/^\uFEFF/u, "").trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<body") || head.startsWith("<?xml") || head.startsWith("<!--");
}
function isPdfSignature(bytes) {
  return bytes.byteLength >= 5 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
}
var SNIFF_BYTES = 512;
function concat(chunks, total) {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
  }
}
async function streamPdf(response, maxBytes, signal, openPath) {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {
      return;
    });
    throw tooLarge(maxBytes);
  }
  if (response.body === null)
    return { pdf: false, head: new Uint8Array };
  const reader = response.body.getReader();
  const pending = [];
  let total = 0;
  let path;
  let descriptor;
  try {
    for (;; ) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (!next.done) {
        total += next.value.byteLength;
        if (total > maxBytes)
          throw tooLarge(maxBytes);
      }
      if (descriptor === undefined) {
        if (!next.done)
          pending.push(next.value);
        const buffered = pending.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        if (!next.done && buffered < SNIFF_BYTES)
          continue;
        const head = concat(pending, buffered);
        pending.length = 0;
        if (!isPdfSignature(head)) {
          if (!next.done)
            await reader.cancel().catch(() => {
              return;
            });
          return { pdf: false, head: head.subarray(0, SNIFF_BYTES) };
        }
        path = openPath();
        descriptor = openSync(path, "wx", 384);
        writeAll(descriptor, head);
      } else if (!next.done) {
        writeAll(descriptor, next.value);
      }
      if (next.done)
        break;
    }
    closeSync(descriptor);
    descriptor = undefined;
    return { pdf: true, byteLength: total };
  } catch (error) {
    await reader.cancel().catch(() => {
      return;
    });
    if (descriptor !== undefined)
      closeSync(descriptor);
    if (path !== undefined)
      rmSync(path, { force: true });
    throw error;
  }
}
function withinDeadline(signal, work) {
  signal.throwIfAborted();
  return new Promise((resolvePromise, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolvePromise(value);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}
function bareHost(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
}
function isSameSiteHop(linkHost, hopHost) {
  const link = bareHost(linkHost);
  const hop = bareHost(hopHost);
  if (link === hop)
    return true;
  if (parseIpv4(link) !== null || parseIpv6(link) !== null || parseIpv4(hop) !== null || parseIpv6(hop) !== null)
    return false;
  return link.endsWith(`.${hop}`) || hop.endsWith(`.${link}`);
}
function isLocalOnlyHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (parseIpv4(host) !== null || parseIpv6(host) !== null)
    return !isPublicUnicastAddress(host);
  return !host.includes(".") || host === "localhost" || [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"].some((suffix) => host.endsWith(suffix));
}
function checkedHttpsUrl(url, first) {
  if (url.protocol !== "https:") {
    throw new PdfAuthError("download", first ? "signed-in PDF downloads only use https links, so your sign-in is never sent unencrypted. " + "Change the start of the link from http:// to https:// and run it again" : `signed-in PDF downloads only use https links, but ${url.hostname} redirected to an unencrypted http link, ` + "so the download stopped to keep your sign-in private");
  }
  if (url.username !== "" || url.password !== "") {
    throw new PdfAuthError("download", "the PDF link must not contain a user name or password");
  }
  if (isLocalOnlyHost(url.hostname)) {
    throw new PdfAuthError("download", `signed-in PDF downloads only go to public websites, so ${url.hostname} was not contacted and no sign-in was read for it`);
  }
  const clean = new URL(url);
  clean.hash = "";
  return clean;
}
async function downloadSignedInPdf(input, options) {
  const timeoutMs = options.timeoutMs ?? PDF_AUTH_DEFAULTS.timeoutMs;
  const maxBytes = options.maxPdfBytes ?? PDF_AUTH_DEFAULTS.maxPdfBytes;
  const maxRedirects = options.maxRedirects ?? PDF_AUTH_DEFAULTS.maxRedirects;
  const controller = new AbortController;
  const timer = setTimeout(() => controller.abort(new PdfAuthError("download", `the download did not finish within ${Math.round(timeoutMs / 1000)} seconds. Try again, or pass a larger --timeout-ms`)), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const cookiesByOrigin = new Map;
  const cookieHosts = new Set;
  const rethrowDeadline = (error) => {
    if (controller.signal.aborted && controller.signal.reason instanceof PdfAuthError)
      throw controller.signal.reason;
    throw error;
  };
  try {
    const link = checkedHttpsUrl(input, true);
    let url = link;
    for (let hop = 0;; hop += 1) {
      const sameSite = isSameSiteHop(link.hostname, url.hostname);
      const cookieKey = `${sameSite ? "same" : "cross"} ${url.origin}${url.pathname}`;
      let header = cookiesByOrigin.get(cookieKey);
      if (header === undefined) {
        let cookies = [];
        try {
          cookies = (await withinDeadline(controller.signal, options.readCookies(url, Math.max(1, deadline - Date.now())))).cookies;
        } catch (error) {
          if (controller.signal.aborted)
            rethrowDeadline(error);
          if (!isNoMatchingCookies(error))
            throw error;
        }
        header = cookies.filter((cookie) => sameSite || cookie.sameSite !== "Strict").map(({ name, value }) => `${name}=${value}`).join("; ");
        cookiesByOrigin.set(cookieKey, header);
      }
      if (header !== "")
        cookieHosts.add(url.hostname);
      controller.signal.throwIfAborted();
      const headers = new Headers({
        accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
        "accept-encoding": "identity",
        "user-agent": USER_AGENT
      });
      if (header !== "")
        headers.set("cookie", header);
      const remaining = Math.max(1000, Math.min(10 * 60000, deadline - Date.now()));
      let response;
      try {
        response = await options.fetch(url, {
          method: "GET",
          redirect: "error",
          headers,
          signal: controller.signal
        }, remaining);
      } catch (error) {
        if (controller.signal.aborted && controller.signal.reason instanceof PdfAuthError)
          throw controller.signal.reason;
        throw new PdfAuthError("download", `could not reach ${url.hostname}. Check the link and your connection, then try again`, { cause: error });
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel().catch(() => {
          return;
        });
        const location = response.headers.get("location");
        if (location === null || location === "") {
          throw new PdfAuthError("download", `${url.hostname} sent a redirect without a destination`);
        }
        if (hop >= maxRedirects) {
          throw new PdfAuthError("download", `the link redirected more than ${maxRedirects} times without reaching a PDF`);
        }
        let next;
        try {
          next = new URL(location, url);
        } catch {
          throw new PdfAuthError("download", `${url.hostname} sent an invalid redirect`);
        }
        url = checkedHttpsUrl(next, false);
        continue;
      }
      const signedIn = cookieHosts.has(url.hostname);
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => {
          return;
        });
        throw refused(options.browser, url.hostname, signedIn);
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {
          return;
        });
        throw new PdfAuthError("download", `${url.hostname} answered with HTTP ${response.status} instead of the PDF`);
      }
      const contentType = contentTypeEssence(response);
      const finalUrl = url;
      let directory = options.directory;
      let result;
      try {
        result = await streamPdf(response, maxBytes, controller.signal, () => {
          directory ??= privateDirectory();
          return join(directory, pdfFilename(finalUrl));
        });
      } catch (error) {
        return rethrowDeadline(error);
      }
      if (result.pdf) {
        return {
          path: join(directory ?? "", pdfFilename(finalUrl)),
          byteLength: result.byteLength,
          finalUrl,
          cookieHosts: [...cookieHosts]
        };
      }
      if (looksLikeHtml(result.head, contentType))
        throw refused(options.browser, url.hostname, signedIn);
      throw new PdfAuthError("download", "the link did not return a PDF file");
    }
  } finally {
    clearTimeout(timer);
  }
}
function privateDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "ghostget-pdf-"));
  chmodSync(directory, 448);
  return directory;
}
function pdfFilename(url) {
  let decoded;
  try {
    decoded = decodeURIComponent(basename(url.pathname));
  } catch {
    decoded = "source.pdf";
  }
  const normalized = decoded.normalize("NFKC").replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^[.-]+|[.-]+$/gu, "").slice(0, 180);
  const stem = normalized === "" ? "source" : normalized.replace(/\.pdf$/iu, "");
  return `${stem}.pdf`;
}
async function validateWordcellArguments(remaining, environment) {
  const { parsePdfArguments } = await import("@hraness/wordcell/pdf");
  const parsed = parsePdfArguments(remaining, environment);
  if (!parsed.ok)
    throw usage(parsed.message);
  if (parsed.value.command !== "capture")
    throw usage("a PDF link is missing");
  return {
    input: parsed.value.input,
    json: parsed.value.json,
    quiet: parsed.value.quiet,
    ...parsed.value.timeoutMs === undefined ? {} : { timeoutMs: parsed.value.timeoutMs },
    ...parsed.value.maxPdfBytes === undefined ? {} : { maxPdfBytes: parsed.value.maxPdfBytes }
  };
}
function authForSignIn(signIn, load) {
  if (signIn.kind !== "auth")
    return;
  let auth;
  try {
    auth = load(signIn.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^auth locator .* was not found/u.test(message)) {
      throw new PdfAuthError("usage", `there is no connected account named ${signIn.id}; ghostget auth list shows the ones you have`, { cause: error });
    }
    throw error;
  }
  if (auth.kind === "cookie-source" || auth.kind === "cookies-file")
    return auth;
  if (auth.kind === "browser-profile" && auth.cookieSource !== undefined)
    return auth;
  if (auth.kind === "browser-profile") {
    throw usage(`connected account ${signIn.id} does not name a browser to read its sign-in from; use --cookie-source chrome instead`);
  }
  throw usage(`connected account ${signIn.id} is not a browser sign-in, so it cannot download a PDF`);
}
function selectionFor(signIn, timeoutMs) {
  if (signIn.kind === "cookies-file") {
    return { cookieSources: [], cookiesFile: signIn.path, cookieProfile: undefined, timeoutMs, requireExplicitCookieScope: true };
  }
  if (signIn.kind === "browser") {
    return { cookieSources: [signIn.source], cookiesFile: undefined, cookieProfile: signIn.profile, timeoutMs, requireExplicitCookieScope: true };
  }
  throw new Error("stored sign-ins are read through their auth record");
}
function cookieFilePath(signIn, auth) {
  if (signIn.kind === "cookies-file")
    return signIn.path;
  return auth?.kind === "cookies-file" ? auth.path : undefined;
}
async function checkCookieFile(path, url, requireExplicitScope) {
  const { readCookieFile } = await import("@hraness/wordcell/clip/cookies");
  const checked = readCookieFile(path, url, { requirePrivate: true });
  if (checked.ok) {
    if (requireExplicitScope && checked.scopeProvenance !== "explicit") {
      throw usage(`the cookie file ${path} must say which website each cookie belongs to; export it as a Netscape cookies.txt file`);
    }
    return;
  }
  if (checked.reason === "empty")
    return;
  if (checked.reason === "unavailable")
    throw usage(`could not open the cookie file ${path}`);
  if (checked.reason === "unsafe-permissions") {
    throw usage(`the cookie file ${path} must be readable only by you; run chmod 600 on it and try again`);
  }
  if (checked.reason === "too-large")
    throw usage(`the cookie file ${path} is too large to be a browser cookie export`);
  throw usage(`the cookie file ${path} is not in a format Ghostget can read; export it as a Netscape cookies.txt file`);
}
async function defaultReadCookies(signIn, auth, url, timeoutMs) {
  const cookieTimeout = Math.min(timeoutMs, 30000);
  if (auth !== undefined) {
    const { acquireWebSessionCookieRecords } = await import("./web-session-cookies-9vac9ms2.js");
    return acquireWebSessionCookieRecords(auth, url, cookieTimeout);
  }
  const { acquireCookieRecords } = await import("./cookie-access-dadm0qvh.js");
  return acquireCookieRecords(selectionFor(signIn, cookieTimeout), url);
}
async function defaultFetch(url, init, timeoutMs) {
  const { pinnedHttpsFetch } = await import("./pinned-https-x7m0say5.js");
  return pinnedHttpsFetch(url, init, timeoutMs);
}
async function redactedUrl(url) {
  const { sanitizeArtifactUrl } = await import("@hraness/wordcell/clip/persist");
  return sanitizeArtifactUrl(url.href);
}
async function runWordcellPdfWithDownload(pdfArguments, download, environment, output, capture = {}) {
  const { runPdfCommand } = await import("@hraness/wordcell/pdf");
  return runPdfCommand(pdfArguments, environment, output, {
    ...capture,
    preparePdfSource: async () => ({
      inputPath: download.inputPath,
      remoteSource: { requestedUrl: download.requestedUrl, finalUrl: download.finalUrl },
      dispose: () => {
        return;
      }
    })
  });
}
async function runSignedInPdf(pdfArguments, dependencies) {
  const { signIn, remaining } = splitPdfSignInArguments(pdfArguments);
  if (signIn === null)
    return dependencies.runWordcellPdf(pdfArguments);
  const validated = await validateWordcellArguments(remaining, dependencies.environment);
  if (!/^https?:\/\//iu.test(validated.input)) {
    throw usage("sign-in options only apply to web links; open a local PDF without them");
  }
  let url;
  try {
    url = new URL(validated.input);
  } catch {
    throw usage("the PDF link is not a valid web address");
  }
  checkedHttpsUrl(url, true);
  const signInResolved = resolveProfilePath(signIn);
  const loadAuthRecord = dependencies.loadAuth ?? ((id) => {
    throw new Error(`auth locator ${id} cannot be loaded`);
  });
  const auth = authForSignIn(signInResolved, loadAuthRecord);
  const browser = browserLabel(signInResolved, auth);
  const timeoutMs = validated.timeoutMs ?? PDF_AUTH_DEFAULTS.timeoutMs;
  const readCookies = dependencies.readCookies ?? defaultReadCookies;
  const cookiesFile = cookieFilePath(signInResolved, auth);
  if (cookiesFile !== undefined && dependencies.readCookies === undefined) {
    await checkCookieFile(cookiesFile, url, signInResolved.kind === "cookies-file");
  }
  dependencies.beforeCookieRead?.();
  const directory = (dependencies.makeTemporaryDirectory ?? privateDirectory)();
  const remove = dependencies.removeDirectory ?? ((path) => rmSync(path, { recursive: true, force: true }));
  try {
    chmodSync(directory, 448);
    const download = await downloadSignedInPdf(url, {
      readCookies: (hop, hopTimeoutMs) => readCookies(signInResolved, auth, hop, hopTimeoutMs),
      fetch: dependencies.fetch ?? defaultFetch,
      browser,
      directory,
      timeoutMs,
      ...validated.maxPdfBytes === undefined ? {} : { maxPdfBytes: validated.maxPdfBytes }
    });
    return await dependencies.runWordcellPdf(remaining, {
      inputPath: download.path,
      requestedUrl: await redactedUrl(url),
      finalUrl: await redactedUrl(download.finalUrl)
    });
  } finally {
    remove(directory);
  }
}
var CHROMIUM_SOURCES = new Set(["chrome", "arc", "brave", "chromium", "edge"]);
function hasCookieStore(directory) {
  return existsSync(join(directory, "Cookies")) || existsSync(join(directory, "Network", "Cookies"));
}
function resolveProfilePath(signIn, home = homedir()) {
  if (signIn.kind !== "browser" || signIn.profile === undefined || !CHROMIUM_SOURCES.has(signIn.source))
    return signIn;
  const profile = signIn.profile;
  if (!profile.includes("/") && !profile.includes("\\"))
    return signIn;
  const expanded = profile.startsWith("~/") ? join(home, profile.slice(2)) : isAbsolute(profile) ? profile : resolve(profile);
  let isFile = false;
  try {
    isFile = statSync(expanded).isFile();
  } catch {
    isFile = false;
  }
  if (isFile || hasCookieStore(expanded))
    return { ...signIn, profile: expanded };
  const inner = join(expanded, "Default");
  if (hasCookieStore(inner))
    return { ...signIn, profile: inner };
  throw usage(`the browser profile folder ${profile} has no saved sign-in; give a profile name instead (ghostget browsers lists them)`);
}
function terminalSafe(value) {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, "?");
}
function plainCookieFailure(message) {
  if (/^authenticated API cookie files require an explicit domain or URL/u.test(message)) {
    return "the cookie file must say which website each cookie belongs to; export it as a Netscape cookies.txt file";
  }
  if (/^the explicitly selected cookie file contained no usable cookies/u.test(message)) {
    return "the cookie file has no cookies for this website";
  }
  return null;
}
async function runSignedInPdfCommand(pdfArguments, output, options) {
  const json = pdfArguments.includes("--json");
  const quiet = json || pdfArguments.includes("--quiet");
  const { cliSentence, cliStyle, renderCliError } = await import("./cli-style-ageyz4fe.js");
  const cookieAccess = await import("./cookie-access-dadm0qvh.js");
  const stderrIsTTY = options.stderrIsTTY ?? process.stderr.isTTY === true;
  const style = cliStyle(options.environment, stderrIsTTY);
  const fail = (code, message, next, exitCode, category = "unknown") => {
    const sentence = cliSentence(terminalSafe(message));
    if (json) {
      output.stdout(`${JSON.stringify({ ok: false, error: { code, message: sentence, next }, captureError: captureError(category) })}
`);
    } else {
      output.stderr(renderCliError(style, sentence, next));
    }
    return exitCode;
  };
  const { stateKeychainNoticeRecord } = await import("./keychain-notice-record-ye72xvdk.js");
  cookieAccess.configureCookieAccessNotice({
    environment: options.environment,
    stdinIsTTY: options.stdinIsTTY ?? process.stdin.isTTY === true,
    stderrIsTTY,
    write: (text) => output.stderr(text),
    readKey: (timeoutSeconds) => cookieAccess.terminalReadKey(timeoutSeconds),
    confirm: false,
    record: stateKeychainNoticeRecord(options.environment)
  });
  const openFirst = "Open the link in your browser first, then run this again";
  try {
    return await runSignedInPdf(pdfArguments, {
      environment: options.environment,
      runWordcellPdf: options.runWordcellPdf,
      beforeCookieRead: () => {
        if (!quiet)
          output.stderr(`Downloading the PDF with your browser sign-in ...
`);
      },
      ...await (async () => {
        const { loadAuth } = await import("./auth-mctmvh5a.js");
        return { loadAuth: (id) => loadAuth(id, options.environment) };
      })(),
      ...options.overrides
    });
  } catch (error) {
    if (error instanceof cookieAccess.CookieAccessSkippedError) {
      return fail("permission-skipped", error.message, "ghostget pdf <url> --cookies-file <path>", 3, "permission-required");
    }
    const denied = cookieAccess.findCookieAccessError(error);
    if (denied !== null) {
      return fail("permission-denied", `${denied.message}. ${cookieAccess.cookieAccessRemedy(denied)}`, "ghostget pdf --help", 3, "permission-required");
    }
    if (error instanceof PdfAuthError) {
      if (error.code === "usage") {
        const next = error.message.startsWith("there is no connected account") ? "ghostget auth list" : "ghostget pdf --help";
        return fail("usage", error.message, next, 2, "invalid-input");
      }
      if (error.code === "access")
        return fail("no-access", error.message, openFirst, 1);
      if (error.code === "no-sign-in")
        return fail("no-sign-in", error.message, "ghostget browsers", 1, "auth-required");
      return fail("download-failed", error.message, "ghostget pdf --help", 1);
    }
    const message = error instanceof Error ? error.message : "the signed-in PDF download failed";
    const plain = plainCookieFailure(message);
    if (plain !== null)
      return fail("no-sign-in", plain, "ghostget pdf --help", 2);
    if (/no matching cookies|no usable origin-scoped cookies|could not be read/u.test(message)) {
      return fail("no-sign-in", `could not use your browser sign-in: ${message}`, openFirst, 1);
    }
    return fail("download-failed", `the signed-in PDF download failed: ${message}`, "ghostget pdf --help", 1);
  } finally {
    cookieAccess.configureCookieAccessNotice(null);
  }
}
export {
  splitPdfSignInArguments,
  runWordcellPdfWithDownload,
  runSignedInPdfCommand,
  runSignedInPdf,
  resolveProfilePath,
  pdfFilename,
  isSameSiteHop,
  hasPdfSignInOptions,
  downloadSignedInPdf,
  PdfAuthError,
  PDF_AUTH_DEFAULTS
};
