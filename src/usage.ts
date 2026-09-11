/**
 * Static CLI help kept separate from the command implementation graph.
 *
 * The installed entrypoint imports only this module and the static release
 * identity for a valid help request, so help remains available even when an
 * optional provider runtime is broken.
 */
export const ghostgetUsage = `Usage:
  ghostget --version                                  Print the exact Ghostget release version
  ghostget init [directory] [--json]                    Initialize a Markdown vault
  ghostget inspect <url> [capture-options]              Inspect capture without persistence
  ghostget pdf <file-or-url> [pdf-options]               Capture a PDF into the vault
  ghostget refresh|check|graph [vault-options]           Maintain or inspect the vault graph
  ghostget backlinks|links <note> [vault-options]        Navigate explicit note relationships
  ghostget list [query-options]                          Query notes and metadata
  ghostget index [semantic-options]                      Build the local semantic index
  ghostget search <query> [semantic-options]             Search the local vault
  ghostget url-metadata backfill [metadata-options]      Backfill saved URL metadata
  ghostget context <repository-path> [context-options]   Resolve scoped agent context
  ghostget agents identity|check|audit [...]             Inspect repository agent guides
  ghostget adapters [--json]                             List public capture adapters

  ghostget <url> [slug] [clip-options] [--auth <id>]       Capture a durable clip
  ghostget clip <url> [slug] [clip-options] [--auth <id>]  Capture a durable clip
  ghostget read <url> [clip-options] [--auth <id>]         Read without persistence
  ghostget archive <url> [media-options]            Create a verified complete media archive
  ghostget media [archive|audio|video|transcript] <url> [media-options]
  ghostget audio|video|transcript <url> [media-options]
  ghostget verify <archive-item-directory> [--json] Verify every archived media artifact
  ghostget transcriber setup --engine whisper-cpp --model <file> [media-options]
  ghostget doctor [--json]                         Check capture, media, auth, and action dependencies
  ghostget capabilities [adapter] [--json]         List installed semantic capabilities
  ghostget web request <https-url> [--method GET|HEAD]
                                                 Retrieve public text through native web rules and approvals
  ghostget interface list                          List user and imported OpenAPI drafts
  ghostget interface export [adapter]              Export installed semantic interfaces as OpenAPI
  ghostget interface import <openapi.json> [--expected-digest <sha256>]
                                                 Save an inert draft; review and activate it in the native app
  ghostget imessage transport install --binary <absolute-reviewed-imsg-file> [--json]
                                                 Install only the current reviewed iMessage transport bytes
  ghostget plugin list [--json]                    List trusted source and installed portable plugins
  ghostget plugin show <id> [--json]               Inspect one source or portable plugin
  ghostget plugin scaffold --site <id> --display-name <name> --origin <https-origin>
                           --operation <semantic.action> --risk <R1|R2|R3>
                           --evidence <internal-api-evidence.json> --candidate <index>
                           --output <empty-directory> [--json]
  ghostget plugin init <id> --display-name <name> --surface <id> --origin <https-origin>
                     --operation <semantic.action>
                     [--transport provider-api|web-session-api|linked-device]
                     [--scope-set <comma-list>...] [--coverage <comma-list>]
                     --output <empty-directory> [--json]
  ghostget plugin check <directory> [--json]        Check a source or portable plugin
  ghostget plugin test <directory> --trust-code [--json]
                                                Run secret-free portable fixtures
  ghostget plugin pack <directory> --output <empty.ghostgetplugin-directory> [--json]
  ghostget plugin install <package-directory> --trust-code
                    [--expected-current <bundle-sha256>] [--json]
  ghostget plugin doctor [--json]
  ghostget plugin disable <id> [--expected-current <bundle-sha256>] [--json]
  ghostget plugin remove <id> [--expected-current <bundle-sha256>] --yes [--json]
  ghostget platforms [surface-id] [--json]         Inspect reviewed policy, not installed adapters
  ghostget thread split <surface-id> --text <text|@file|-> [--json]
  ghostget thread publish <surface-id> --adapter <id> --text <text|@file|-> --auth <id>
                        [--preview] [--headed] [--json]
  ghostget operator doctor [--json]                Compatibility alias for 'ghostget doctor'

  ghostget auth list [--json]
  ghostget auth login <id> --client-file <desktop-client.json>
                         [--no-open] [--force] [--json]
  ghostget auth bind <id> --site <provider-surface-id> [--force] [--json]
  ghostget auth add <id> --cookie-source <browser> [--cookie-profile <name>]
                       [--subject <provider-viewer-or-account-id>] [--force]
  ghostget auth add <id> --cookies-file <path>
                       [--subject <provider-viewer-or-account-id>] [--force]
  ghostget auth add <id> --browser-profile <name|path> --trust-profile-egress
                       [--browser-executable <absolute-browser-binary>]
                       [--cookie-source <browser> [--cookie-profile <name>]]
                       [--subject <provider-viewer-or-account-id>] [--force]
  ghostget auth add <id> --oauth-provider <provider-surface-id> --token-file <path>
                       --scopes <comma-list> [--subject <provider-viewer-or-account-id>] [--force]
  ghostget auth add <id> --linked-device <provider-surface-id> [--device-store <private-directory>]
                       [--subject <provider-account-id>] [--force]
  ghostget auth pair <id> [--phone <international-number>]
  ghostget auth sync <id> --once [--json]       Explicitly connect and refresh the local projection
  ghostget auth remove <id> --yes

  ghostget apple-photos export-contact-evidence
                [--library <normalized-absolute-.photoslibrary>] [--json]
                # private cluster evidence; returned JSON has no images, crops, or templates

  ghostget beeper export-message-like-me --auth <id> --output <new-absolute-directory>
                [--limit-chats <n>] [--limit-messages <n>]
                [--max-participants <n>] [--json]
  ghostget beeper export-contact-interactions --auth <id>
                [--limit-chats <n>] [--limit-messages <n>]
                [--max-participants <n>] [--json]
                # body-free receipt/output envelope on stdout; progress on stderr

  ghostget whatsapp export-message-like-me --auth <id>
                  --output <new-absolute-directory> [--json]
                  # local wacli.db bundle only; no send, pairing, or cloud sync

  ghostget messaging routes --input <-|@absolute-private-file>
                          --private-output <absolute-mode-0600-file> [--json]
  ghostget messaging resolve --input <-|@absolute-private-file>
                           --private-output <absolute-mode-0600-file> [--json]
  ghostget messaging context --input <-|@absolute-private-file>
                           --private-output <absolute-mode-0600-file> [--json]
  ghostget messaging preview --input <-|@absolute-private-file>
                           --private-output <absolute-mode-0600-file> [--json]
  ghostget messaging reconcile <run-id> [--json]
                # capability refs and bodies never appear in argv or stdout

  ghostget adapter init <id> (--origin <https-origin> | --platform <surface-id>)
                             --output <directory> [--force]
  ghostget adapter sync-bundled [--json]                 Install or safely upgrade reviewed bundled manifests
  ghostget adapter scaffold [plugin-scaffold-options]  Compatibility alias for 'ghostget plugin scaffold'
  ghostget adapter validate <manifest> [--json]
  ghostget adapter install <manifest> [--force | --upgrade-from <prior-bundled-manifest>...]
  ghostget adapter remove <id> --yes

  ghostget derive start <id> <url> [--auth <id>] [--content none|text] [--domains <list>]
                       [--cookie-origin <exact-https-origin>...] [--fixture <media>...]
                       [--allow-remote-actions] [--headed] [--json]
  ghostget derive list [--json]
  ghostget derive browser <derivation-id> -- <semantic agent-browser command>
                       # bounded textbox reset: cleartext @snapshot-textbox-ref
                       # bounded upload: upload @ref|@single-file-input|@single-image-input|@single-video-input fixture:<n>...
                       # chooser upload: choose-upload @upload-control-ref fixture:<n>...
                       # terminal upload: upload-and-seal @ref|@single-file-input|@single-image-input|@single-video-input fixture:<n>...
  ghostget derive review <derivation-id> [--review-origin <exact-https-origin>]
                       [--offset <n> --limit <1-100>] [--json]
  ghostget derive review <derivation-id> --entry <zero-based>
                       [--review-origin <exact-https-origin>]
                       [--fixtures - | --field-names -] [--json]
  ghostget derive finish <derivation-id> --output <directory> [--review-origin <exact-https-origin>]
                       [--platform <surface-id>] [--force] [--json]
  ghostget derive analyze <har> --adapter <id> --origin <origin> --output <directory> [--platform <surface-id>]
  ghostget derive discard <derivation-id> --yes

  ghostget invoke <adapter> <operation> [--input <json|@file|->] [--auth <id>]
                [--preview | --cache-only | --projection-identity-only]
                [--duplicate-risk-of <run-id>]
                [--headed] [--json]
  ghostget omni read --input <json|@file|->
                [--cache-only | --identity-only | --from-exact-cache]
                [--headed] [--json]
  ghostget <adapter> <operation> [invoke-options]  Shorthand for 'ghostget invoke'
  ghostget confirm <plan-digest> [--headed] [--private-output <absolute-path> --receipt-binding-output <absolute-path>] [--json]
  ghostget plans list [--json]
  ghostget plans cancel <plan-digest> --yes
  ghostget runs list [--json]
  ghostget runs show <run-id> [--private-output <absolute-path> --receipt-binding-output <absolute-path>] [--json]
  ghostget runs reconcile <run-id> [--input <json|@file|->] [--json]  Reconcile from transport-specific external evidence

Local browser admission:
  Ghostget runs at most two locally owned browsers across processes sharing one
  state home for fresh/profile page capture. Polling consumes the capture
  timeout and has a 30-second budget; an in-flight bounded state helper may
  settle later, but no browser launches after deadline revalidation. Initialize
  a new state home serially with 'ghostget runs list --json'.
  Explicit CDP and browser-live attachments skip this gate. Same-boot stale
  claims stay occupied; use 'ghostget doctor --json' for the state-home path.
  Managed provider/bootstrap and derivation sessions remain outside this cap.

Risk policy:
  R1 authenticated reads execute directly. R2/R3 writes create an exact, five-minute
  preview plan; run 'ghostget confirm <digest>' to execute it once. R4 is blocked.
  Signed-in site actions use code-owned first-party API or linked-device protocol
  contracts; browser action recipes are rejected across protected site families.
  Ghostget never exposes arbitrary eval, request, selector, cookie, storage, or raw
  file-transfer capabilities.

Read projections:
  Successful subject-bound R1 results publish encrypted exact-query snapshots.
  Repeat the invocation with --cache-only to return that snapshot without a browser
  or provider roundtrip. --projection-identity-only returns only opaque auth/query
  identity and the validated input hash without decoding the snapshot. A normal
  invocation explicitly revalidates it. Unbound reads are never cached.
  Bind the auth locator to its verified account subject before private snapshots can
  be served.

Omni views:
  Supported provider inbox reads materialize into encrypted Conversation, Message,
  and Notification entities. 'omni read --cache-only' returns the merged local view
  without provider work. A normal omni read explicitly revalidates each declared
  source; --from-exact-cache rebuilds derivatives from exact snapshots only.
`;
