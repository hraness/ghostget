# Changelog

Versioned sections identify checked package source. Starting with v0.16.13,
a version is publicly released after its exact canonical GitHub archive and
provenance are published in an immutable Release. npm mirrors are optional.
Historical entries retain their original delivery coordinates.

## Unreleased

- Read LinkedIn `contacts.read@1` Contact-info Email from the headed
  ProfileContactDetailsOverlay navigation POST after 1st-degree bind.
  Operator Chrome showed Email in the Contact-info modal; the first
  response that contained the Email label was POST
  `/flagship-web/rsc-action/actions/navigation?screenId=…ProfileContactDetailsOverlay&sduiid=…ProfileContactDetailsOverlay`
  with JSON `{ clientArguments, isModal }` and an RSC
  `application/octet-stream` flight. Headed capture bound `sduiid` to
  the same overlay `screenId` constant, not a per-session mint.
  Dormant profile HTML NavigateToScreen exposes `pageKey`
  `profile_view_base_contact_details` and
  `requestedArguments.payload` (`vanityName`, `givenName`,
  `familyName`, `isVanityNameResolved`) but omits `sduiid`; the
  operation still POSTs that exact allowlisted URL after 1st-degree
  bind and peels reviewed payload keys without inventing `$type`,
  `requestMetadata`, or a stolen id. A different `sduiid` fails
  closed. GraphQL Contact-info stays 403 `text/html`, navigation
  overlay GETs stay 500-rejected, and the vanity overlay GET remains
  HTML-shell honesty when no Contact-info NavigateToScreen is present.
  Soft-labels stay. Self, non-first-degree, and contradictory
  distances still fail closed, and no email is invented.
  Adapter bundle 1.31.0. This is the ninth live Contact-info drift after
  the 1.30.0 overlay-shell honesty path. Cloud has no signed-in LinkedIn
  session; do not treat this landing as live green.
- Keep LinkedIn `contacts.read@1` honest when GraphQL Contact-info stays HTTP
  403 `text/html` and the vanity `/in/:publicIdentifier/overlay/contact-info/`
  GET returns an HTML-200 profile shell with no Email. Dormant contained
  Chrome cannot mint the client-filled Contact-info modal from GET-only
  RSC or HTML. An HTML shell now fails as omitted Contact-info fields
  after 1st-degree binding, not as a JSON-object parse. Overlay HTML that
  still carries Como Email, a unique mailto, or an RSC/SDUI flight still
  projects. `/flagship-web/rsc-action/actions/navigation` overlay GETs stay
  rejected. Self, non-first-degree, and contradictory distances still fail
  closed, and no email is invented. Adapter bundle 1.30.0. This is the eighth live
  Contact-info drift after the 1.29.0 vanity overlay.
- Read LinkedIn `contacts.read@1` Contact-info email from the exact vanity
  `/in/:publicIdentifier/overlay/contact-info/` RSC GET when GraphQL
  `voyagerIdentityDashProfileContactInfo` is unavailable. Live dormant
  sessions still bind 1st-degree distance, but the 1.28.0
  `/flagship-web/rsc-action/actions/navigation` overlay GET returns HTTP
  500 `application/octet-stream`, GraphQL still returns HTTP 403
  `text/html`, and long SDUI strings in profile HTML aborted the
  best-effort embedded walk at profile stage. The operation now skips
  non-bounded field labels during that walk and GETs the live HTML-200
  vanity overlay path with RSC browser binding. ScreenId-only and
  `profileUrn`-bound navigation overlay URLs, other RSC screens, and
  writes stay rejected. Self, non-first-degree, and contradictory
  distances still fail closed, and no email is invented. Adapter bundle 1.29.0. This is the seventh live
  Contact-info drift after the 1.28.0 navigation overlay.
- Read LinkedIn `contacts.read@1` Contact-info email from the target-bound
  ProfileContactDetailsOverlay RSC navigation when GraphQL
  `voyagerIdentityDashProfileContactInfo` is unavailable. Live dormant
  Chrome and Arc sessions still bind 1st-degree distance from profile HTML,
  but Contact-info GraphQL returns HTTP 403 `text/html` and the page embeds
  no queryId. The operation now GETs the overlay with exact `screenId` plus
  `profileUrn` when queryId is absent, or after that reviewed GraphQL
  rejection, and projects Email plus Connected since from the RSC or SDUI
  payload. ScreenId-only overlay URLs, other RSC screens, and writes stay
  rejected. Self, non-first-degree, and contradictory distances still fail
  closed, and no email is invented. Adapter bundle 1.28.0. This is the sixth
  live Contact-info drift after the 1.23.0 flight-array parse, the 1.24.0
  deep-walk / `vieweeProfileId` join, the 1.25.0 `vieweeMemberUrn` distance
  join, the 1.26.0 multi-escaped peel, and the 1.27.0 non-flight string-slot
  bootstrap.
- Read LinkedIn `contacts.read@1` first-degree distance from non-flight Como
  rehydration string slots. Live pages after adapter 1.26.0 still bound
  identity through `vieweeProfileId` plus vanity, but `networkDistance` and
  paired `vieweeMemberUrn` sat in a Como array string that was not an RSC
  flight. `decodeComoRehydrationValue` dropped that slot before the 1.26.0
  peel could run. Non-flight string slots now go through
  `decodeStringBootstrap`. True RSC flights still use
  `decodeRscFlightRecords`. Self, non-first-degree, and contradictory
  distances still fail closed, and no email is invented. Adapter bundle 1.27.0.
  This is the fifth live Contact-info drift after the 1.23.0
  flight-array parse, the 1.24.0 deep-walk / `vieweeProfileId` join, the
  1.25.0 `vieweeMemberUrn` distance join, and the 1.26.0 multi-escaped peel.
- Read LinkedIn `contacts.read@1` first-degree distance from multi-escaped Como
  PROFILE_VIEW breadcrumb rows. Live pages after adapter 1.25.0 still bound
  identity through `vieweeProfileId` plus vanity, but `networkDistance` and
  paired `vieweeMemberUrn` sat in string rows such as `networkDistance\":1`.
  The binder now peels JSON string escapes and accepts those escaped key/value
  forms. Object, flight-array, and lightly escaped breadcrumbs still bind.
  Self, non-first-degree, and contradictory distances still fail closed, and
  no email is invented. Adapter bundle 1.26.0. This is the fourth live
  Contact-info drift after the 1.23.0 flight-array parse, the 1.24.0 deep-walk
  / `vieweeProfileId` join, and the 1.25.0 `vieweeMemberUrn` distance join.
- Join LinkedIn `contacts.read@1` first-degree distance when identity comes from
  `vieweeProfileId` plus vanity and `networkDistance` sits on a PROFILE_VIEW
  breadcrumb or `vieweeMemberUrn` record, including a member id or a different
  `fsd_profile` encoding than the bound URN. Self, non-first-degree, and
  contradictory distances still fail closed, and no email is invented.
  Adapter bundle 1.25.0. This is the third live Contact-info drift after the
  1.23.0 flight-array parse and the 1.24.0 deep-walk / `vieweeProfileId` join.

## 0.18.0 - 2026-09-11

- Add a macOS-first Tauri control panel for accounts, semantic capabilities,
  permissions, human approval, user OpenAPI interfaces, and copyable agent
  instructions. Keep the existing Bun kernel and a narrow Rust host. Direct
  drives the real shared UI; the website embeds inert renders of its scenarios.
- Add exact account and implementation-bound operation grants and a public
  HTTPS web gateway with domain/path rules, human approval, and local SQLite
  request metadata. Activity has search, filters, a virtualized table, and
  cursor-based infinite scrolling.
- Add browser connection and subject verification for X, LinkedIn, and Reddit,
  plus an isolated 1Password X token import sink. Password and passkey login
  remains in the system browser. The native app is a source build; signed
  desktop authentication and installer distribution are separate qualification.
- Make user-space OpenAPI imports inert, reviewable drafts with exact semantic
  executor bindings and explicit activation. Future middleware and automatic
  approval remain extension boundaries, with no model runtime in the kernel.

## 0.17.6 - 2026-09-10

- Align the marketing site with AICharts using the shared Paper colors, Nebula
  Sans, and compact headings. Keep the existing component versions and vendor
  an immutable, verified theme snapshot so visual updates stay independent of
  UI and compiler upgrades. CLI and provider behavior is unchanged.

## 0.17.5 - 2026-09-10

- Read the main-branch CodeQL analyses as a bounded twenty-entry newest-first
  window during release source-CI admission. The `v0.17.4` request failed
  before building any asset because `main` had accumulated one hundred
  analyses and the previous single-page read treated a full page as
  truncation; `v0.17.4` stays an assetless tag and this version is the first
  one published to npm by the tag Release workflow. No runtime behavior
  changes.

## 0.17.4 - 2026-09-10

- Publish `@hraness/ghostget` to npm automatically from the tag Release
  workflow, unified with the other Hraness packages by owner decision: after
  the immutable GitHub Release, the checkout-free `publish_npm` job in the
  `npm-release` environment binds the attested canonical artifact by numeric
  ID, admits an absent registry version (or recognizes the exact prior
  publication on a rerun), and runs one `npm publish --provenance` through OIDC
  trusted publishing; `admit_npm` then verifies the registry bytes and npm
  provenance against the canonical asset. The dispatch-only `npm-stage.yml`,
  its stage-intent ledger, and the `npm-stage` environment are retired, so a
  release needs no second workflow, staged approval, token, or two-factor step.
  No runtime behavior changes.

## 0.17.3 - 2026-09-10

- Read LinkedIn `contacts.read@1` Contact info from current profile pages:
  `window.__como_rehydration__` is accepted as either a JSON object or an RSC
  flight array, flight rows that carry JSON objects or arrays are decoded, and
  the first-degree relationship binds when `memberDistance`, `networkDistance`,
  or `distance` of `DISTANCE_1`, `1`, or `"1"` joins the requested vanity or
  profile URN. Self and non-first-degree profiles still fail closed, Contact
  info still resolves by `queryName` when the page embeds no decorated
  `queryId`, and no email is ever invented. Adapter bundle 1.23.0.

## 0.17.2 - 2026-09-10

- Publish `@hraness/ghostget` to npm as ordinary software by owner decision:
  the package carries no `contentPolicy` declaration and no `DISCLOSURE` file,
  matching the other Hraness listings, and the optional npm mirror publishes
  directly through the workflow's trusted publisher instead of a staged
  publish that needs two-factor promotion. The exact canonical GitHub archive
  remains the release authority.

## 0.17.1 - 2026-09-10

- Read GitHub job logs with `--allow-escape-sequences` during release source
  admission; the hosted runner's current `gh` otherwise refuses logs that carry
  terminal escape sequences, which failed the `v0.17.0` request before any
  canonical asset was built. That tag and run are retained without assets.

## 0.17.0 - 2026-09-09

- Rename the project, CLI, SDK package, and public Agent Skill to Ghostget, with
  `ghostget.com` as the canonical website and `@hraness/ghostget` as the package.
- Preserve existing local state, encrypted records, receipts, and adapter
  formats during the upgrade. New installations use Ghostget names; the
  [migration guide](docs/ghostget-migration.md) lists compatibility names.
- Keep historical release coordinates and the original first-capture recording
  intact, with the recording identified as predating the rename.

## 0.16.17 - 2026-09-09

- Adopt published Sweet Cookie 0.4.3 through KB 0.19.6 and the exact verification
  dependency. Retain explicit browser keychain selection for custom profiles.
- Reject opaque partition metadata in cookie-file web sessions before request
  replay, including malformed flags and opaque records without a partition key.

## 0.16.16 - 2026-09-09

- Retry exact claim-read drift during browser admission after ownership
  reconciliation, preserving the two-browser cap, deadlines, and unsafe-state
  refusal. Retain immutable v0.16.15 and its failed mirror evidence.

## 0.16.15 - 2026-09-09

- Pin consumer compiler and declaration versions to the qualified source tuple;
  retain strict checks and log resolved identities.
- Preserve both failed v0.16.14 attempts and their evidence. Neither published
  artifacts.

## 0.16.14 - 2026-09-09

- Check the real canonical npm archive in required PR CI before tagging, using
  the same pinned Node and npm versions as the release workflow. Retain Bun
  package checks and exact archive, payload, provenance, and install admission.
- Retain the failed v0.16.13 tag: its source gate passed, but canonical archive
  preparation exceeded the compressed-byte ceiling before any asset upload.
  This version becomes public only after its own immutable Release succeeds.

## 0.16.13 - 2026-09-09

- Distribute the same named CLI and seven SDK exports through a versioned
  GitHub Release archive with an exact manifest, checksums, signed provenance,
  and isolated installation checks. Keep existing dependency pins.
- Publish canonical artifacts independently of npm staging. Optional npm
  mirrors consume identical verified archive bytes and retain stage-only OIDC,
  durable intent, unsafe-configuration checks, and required two-factor promotion.
- Admit production through immutable canonical artifact evidence and independent
  promotion provenance verification while retaining the exact source, App,
  canary, conditional ref write, revocation, provider, and public-readback guards.

## 0.16.12 - 2026-09-08

- Add LinkedIn `contacts.read` for first-degree Contact info with bounded reads
  and exact account and profile identity checks.
- Compile shared website styles while preserving typography, keyboard focus,
  touch targets, forced colors, and reduced motion.

## 0.16.11 - 2026-09-07

- Own LinkedIn profile-activity browser acquisition, current-account binding,
  independent profile observation, bounded page projection and native cleanup
  in an Effect 3.22.1 program. Keep pagination, result shapes and close order.
- Use producer-owned identity evidence and typed browser failures for account
  mismatch and authentication repair; diagnostic text cannot grant either.
- Own the complete R2/R3 confirmation lifecycle in one native Effect program:
  claim validation, durable journal/receipt/ledger/recovery preparation, dispatch,
  result reconciliation and cleanup. Keep the public Promise interfaces and
  existing preview, confirmation and at-most-once authority.
- Persist dispatch and accepted-target callbacks synchronously before their
  returned Promises can be awaited. Preserve the exact selected native cleanup
  rejection, including falsey values, while earlier causes remain private.
- Retain physical cleanup custody and durable recovery after uncertain native
  work. Lost acknowledgment withholds unproven output and never permits an
  automatic resubmission; journal-proven output survives a repairable projection
  failure without repeating execution.

## 0.16.10 - 2026-09-07

- Show the Ra mark and five social links in the shared website footer, with
  compact spacing and the existing mailing signup.
- Report Reddit read throttling as a structured retryable failure. Validate
  retry metadata and keep provider response details out of public diagnostics.

## 0.16.9 - 2026-09-06

- Move R1 read receipt sequencing, deadline handling, cleanup admission, GitHub
  organization reads, and LinkedIn self-profile and company reads into bounded
  Effect 3.22.1 programs. Preserve public Promise interfaces, result projections,
  and R2/R3 write dispatch rules. Require typed identity-response metadata for
  the reviewed LinkedIn transport fallback.
- Prevent GitHub read retries when response cleanup fails or times out, including
  cancellation that rejects without an error value. Keep cleanup causes private.
- Wait for native cleanup proof before releasing authenticated read admission.
  A 30-second cleanup-join deadline retains unsafe admission; late cleanup cannot
  upgrade that settled outcome. Preserve contained-browser ownership and
  private-root checks.
- Keep built-in durable contract identities fixed while deriving and revalidating
  the complete current source/dependency closure. Reuse pre-encoded UTF-8 sort
  keys during dependency discovery; fresh trust observations and byte ordering
  remain unchanged. The added Effect dependency expands that inspected graph.
- Refresh the reviewed X UserTweets query descriptor and bind changed user
  identity shapes to the requested account. When the response omits user-level
  identity, require matching authored-post evidence; reject contradictory or
  unproven identities with structured contract-drift refusal.

## 0.16.8 - 2026-09-06

- Preserve completed LinkedIn profile and organization statistics and Instagram
  profile statistics when their contained browser exits naturally just after
  the single close attempt. Cleanup may retry only one strict, no-effect
  convergence proof: exact dead owner, two inactive session reads, unchanged
  private roots, three spaced CDP refusals, and a final owner, session, and root
  reproof before the existing durable journals remove either root. Never repeat
  the provider read, close attempt, or termination signal, and keep malformed,
  identity-drifted, root-replaced, CDP-ambiguous, and claim-drifted states
  fail-closed.
- Bind LinkedIn profile-activity requests to the observed REST.li variable
  ordering and escaping. Treat the current `total: 0` response as a terminal
  page, and advance from a positive paging total without inventing a missing
  next link.

## 0.16.7 - 2026-09-05

- Recover a same-boot contained-browser cleanup when its pinned daemon exits
  naturally between the initial live-owner proof and the first session read.
  Require repeated inactive-session and unchanged private-root proofs, then a
  final dead-owner proof plus three consecutive CDP refusals; issue no close
  or signal on this path.

## 0.16.6 - 2026-09-05

- Add Beeper `contacts.list@3` on beeper-linked-device 2.4.0 as a Desktop
  loopback contract that walks `hasMore` and `oldestCursor` pages up to the
  existing 200-item bound and returns an opaque continuation when more remain.
  Keep contracts 1 and 2 on official CLI 0.6.2 with the first-page window.
- Page a signed-in LinkedIn member's recent-activity feed through
  `linkedin-web feeds.read@2` (`feed=profile-activity`) with durable URNs,
  commentary, and engagement counts when LinkedIn supplies them. Keep the
  home-feed reservation as archived `feeds.read@1`.
- Add observed Reddit `flair.user.choices` and `flair.post.choices` reads
  through the exact old-Reddit selector contract. Selection writes stay
  `capture-required`.
- Move Instagram authenticated-web profile statistics reads into a contained
  browser session with fail-closed drift handling.
- Align the public website with the shared Hraness footer and marketing
  design contracts.

## 0.16.5 - 2026-09-04

- Require the production-outcome job after either mutually exclusive ref path,
  so an intentionally skipped alternate writer can no longer suppress terminal
  Vercel and public-site verification.
- Emit a canonical release marker only from a verified Production build and
  bind the apex, Beeper guide, `llms.txt`, `www` redirect, GitHub deployment,
  immutable Release, tag, and exact Vercel deployment URL before promotion
  succeeds.
- Treat Vercel custom-domain auto-assignment as a persistent project invariant
  with exact setting-only admission and fail-closed staged-deployment recovery.
- Allow GitHub's Latest Release projection a bounded create-only convergence
  window pinned to its exact predecessor, while existing releases and terminal
  readbacks remain immediate and exact.
- Require fresh signed-in administrator proof of immutable Releases and the
  no-bypass version-tag update/deletion ruleset before a release tag is pushed.

## 0.16.4 - 2026-09-03

- Add public `clasificados-web listings.search` for reviewed San Juan rental
  list pages. Return canonical listing URLs, rent, beds, baths, and a
  neighborhood derived from street, ZIP, known address, or list-card
  coordinates rather than broker copy. Document the Zillow-group PerimeterX
  and Puerto Rico MLS public-search blockers instead of shipping capture-required
  stubs.
- Add bounded Apple Photos contact evidence through a detached private worker.
  The worker captures full Photos and Contacts SQLite databases with `VACUUM
  INTO`, so transient copies can contain unselected columns and raw blobs even
  though returned JSON excludes them. Wrench never opens, copies, or asks
  Photos to materialize referenced photo or video asset files.
- Add a native, read-only WhatsApp Message Like Me schema-2 export from one
  existing Wacli 0.15.0 local store. The seven-file private bundle excludes
  proven PN/LID self chats and reactions, reports incomplete local-history and
  `reaction-state-unproven` evidence when applicable, and cannot pair, sync, or
  send.
- Publish dedicated Apple Photos and WhatsApp SDK entrypoints and bind the
  WhatsApp consumer to immutable Message Like Me v0.7.0 contract bytes.
  Runtime Wacli admission verifies the official release, exact SHA-256, and
  offline code signature; the installer separately repeats online notarization.
- Version the complete reviewed Beeper CLI 0.6.2 surface independently from the
  executable identity. The v2.3 adapter exposes 32 semantic operations, keeps
  every other command explicitly classified, retains v2.2, v2.1, and v2.0 as
  exact upgrade baselines, and leaves destructive or unbounded surfaces inert.
- Export one bounded page of the signed-in X account's bookmarks, keyed by
  `post_id`, while resolving the reviewed Bookmarks operation across overlapping
  webpack maps.
- Publish an Omarchy desktop-root news take that keeps a session-wide host
  privilege grant distinct from one named, release-attested Wrench operation.
- Require immutable, canonically timestamped GitHub Releases for completed
  release ordering. Bind release and promotion to exact source, main, workflow,
  and high-privilege control ancestry before and after irreversible publication,
  while preserving uncertain post-publication evidence without rollback.
- Bind production promotion to a one-repository release App, an explicit
  expected-old Git lease, and terminal Vercel outcome evidence. Keep the
  established production ref protected against deletion, non-fast-forward
  movement, and ordinary-writer updates.

## 0.16.3 - 2026-09-01

`@hraness/wrench@0.16.3` is an irreversibly consumed stale-source npm-only
coordinate from `c2d956ca4102d38c29e24ca4e13f26ce862b47f3`. npm published it
on 2026-09-03, but it has no matching Git tag, GitHub Release, or production
promotion, and it is not a completed Wrench release.

- Redesign the release-bound product site around a result-first hero, a
  three-step proof, a capability fact grid, a verified install block, and
  explicit CLI, SDK, and Agent Skill paths while retaining canonical metadata
  and compact-layout coverage.
- Route Beeper account listing, chat search, exact-chat reads, message history,
  and filtered message search through fixed authenticated Desktop loopback
  `GET` routes. Preserve opaque older/newer cursors across bounded pages, reject
  replay or coordinate drift, and never call the separate mark-read route.
- Let Beeper message search paginate an exact account/chat/date-filtered local
  index without query text. Keep the prior v2.1.0 and v2.0.0 adapter manifests
  as exact upgrade baselines, and retain the local-materialization
  caveat rather than claiming complete remote provider history.
- Accept one `x-web` `posts.publish` body up to the reviewed CreateTweet
  25000-unit bound without truncation. Bind long-form text from `note_tweet`
  when CreateTweet returns a short `full_text` preview. Thread and reply item
  caps stay 280.
- Refresh the reviewed X UserTweets and SearchTimeline operation coordinates
  from current authenticated bundle evidence.
- Recover an orphaned same-boot browser session through a durable doctor lease
  bound to its exact daemon start identity, launch, CDP endpoint, and private
  root generations. Prepared, launch-intent, quiescent, and per-root removal
  phases make close, TERM, and deletion recovery crash-resumable. Changed or
  unprovable state remains fail-closed without making reboot part of the
  recovery contract.
- Return a bound `cleanup-required` result when durable realm admission blocks
  an R1 read before dispatch. JSON callers retain the no-retry category while
  the cleanup-unsafe claim remains fail-closed.
- Fail closed before every Vercel build unless a true local invocation has no
  Vercel signal or the checked-in release marker and exact platform state agree.
- Resolve the production release tag through a separately byte-bounded GitHub
  SHA response while retaining fixed local `git rev-parse HEAD` evidence,
  removing the remote Git descendant boundary from website admission.
- Move automatic main-only npm staging out of GitHub deployment review. npm
  still requires separate human inspection and two-factor approval before the
  staged version becomes public.

## 0.16.2 - 2026-08-28

- Require agentic messaging resolution to consume one opaque list-candidate
  route reference. Wrench reloads the checked provider target from encrypted
  private state and proves it with an exact read, so callers cannot inject or
  replace a provider account, network, conversation ID, or recipient match.
  The changed discovery, route, and resolve wire artifacts are V2; the shipped
  v0.16.1 V1 shapes remain available only for strict archival parsing.
- Start stage-only npm verification automatically when a greater stable package
  version reaches `main`. Unchanged manifest versions stop before OIDC, and the
  terminal staging job requires maintainer approval through the protected
  `npm-stage` environment before npm's separate two-factor approval.
- Add the Agent Skill to npm discovery metadata and link npm, GitHub, and
  skills.sh from the README and public software identity.
- Centralize the packed, unpacked, and file-count ceilings used by source
  artifact inspection and clean-consumer package smoke tests. The reviewed
  limits retain bounded room for the observed Linux and macOS gzip spread.

- Add a strict machine-readable Hraness social-profile collection manifest,
  correct the second X account to Life Days Left, and bind the current Twitch
  and GitHub organization metrics plus the expected Threads eligibility gap.
- Project stable, secret-free failure categories and retry dispositions for
  failed R1 reads across every provider in the Hraness manifest. Consumers can
  distinguish target, auth, account, provider, timeout, contract, and cleanup
  failures without exposing provider responses or inventing retry policy.

## 0.16.1 - 2026-08-27

- Add a provider-neutral agentic messaging facade that keeps exact routes,
  current context, prose, replies, and receipts in encrypted state and
  explicit owner-only artifacts. One private preview authorizes one ordered
  one-to-eight-bubble turn; the durable journal preserves submitted, failed,
  partial, and indeterminate outcomes without retrying uncertain work.
- Qualify Beeper Desktop for exact live agentic actions through its loopback
  API. Wrench binds one account and conversation, checks participants and the
  exact expected own-message prefix before every remaining bubble, and stops
  on foreign activity, edits, deletions, reorderings, or provider drift.
- Add a reviewed direct iMessage local transport with fixed JSON-RPC stdin,
  exact chat-row revalidation, AppleScript private files, disabled SMS
  fallback, and independent outgoing `chat.db` acceptance evidence. Threaded
  replies remain unsupported and every bubble has a separate no-retry fence.
- Vendor and verify a patched Wacli/Whatsmeow stdin-only private transport.
  The registered WhatsApp action remains unavailable until controlled live
  freshness, acceptance, and reconciliation qualification is complete.
- Ship the reviewed iMessage transport installer through the public CLI with
  digest verification, no-overwrite semantics, path-private diagnostics, and
  fail-closed handling for unsafe source and state paths.
- Add an exact lightweight `wrench --version` command and bind package smoke
  tests to the installed binary's immutable release identity.

## 0.16.0 - 2026-08-27

- Redesign wrench.rip as a restrained editorial site with a supported-actions-only
  provider directory, task-first capability labels, and no zero-action service
  cards in the public catalog.
- Add `x-web articles.read@2` for one exact current-viewer-owned private Article
  draft. The closed R1 result binds its ID, owner, Draft lifecycle, unpublished
  state, title, and bounded rich content; published X Articles and LinkedIn
  Article reads remain unsupported.
- Add `reddit-web media.read@2` for one exact Reddit-hosted video post through
  the current-account-bound `/api/info` exchange. The metadata-only R1 result
  returns post fields, dimensions, duration, safety flags, and completed status
  without playback URLs; standalone Threads post and media reads and Marketplace
  media reads remain unsupported.

## 0.15.1 - 2026-08-27

- Publish Wrench through the public npm registry with an exact Bun runtime
  floor, a bounded package inventory, and stage-only trusted publishing for
  later releases.
- Declare Wrench's authenticated browser and provider capabilities as dual-use
  content and ship the required disclosure in every package.
- Admit TAB, LF, and CR in projected X post bodies. Request headers, cursors,
  timestamps, every other C0 control, and DEL remain fail-closed.

## 0.15.0 - 2026-08-27

- Add a source-only `local-cli` provider transport with schema-v6 adapter
  selectors, exact per-platform executable identity, implementation-bound
  plans and receipts, strict subprocess lifecycles, and no generic argv or
  portable native-process authority.
- Expand the pinned Beeper Desktop integration from five reads to typed account,
  bridge, contact, conversation, message, send, edit, reaction, conversation
  state, metadata, reminder, draft, focus, and presence operations. Bind all
  four official 0.6.2 platform artifacts, isolate oclif user plugins and ambient
  targets, and account for all 101 upstream commands in a checked coverage
  ledger while leaving administrative, destructive, raw, and arbitrary-path
  commands unavailable or R4.
- Preserve the released schema-1 contact-interaction receipt on its exact
  macOS arm64 writer while keeping its 2,000-participant request ceiling;
  cross-platform Beeper operations use the new versioned local-CLI contracts.
- Add a manifest-derived provider directory to wrench.rip with exact observed
  and capture-required counts, grouped operation evidence, and local semantic
  icons that do not imply provider endorsement.
- Publish a focused Beeper guide that binds its 32 observed operations to the
  official CLI, adapter, semantic contracts, Desktop realm, executable hashes,
  preview and dispatch rules, export boundaries, and explicit exclusions.
## 0.14.0 - 2026-08-26

- Add a versioned, body-free Beeper direct-contact interaction summary over
  the same admitted sequential history as the Message Like Me v1 bundle. The
  summary preserves exact account-scoped provider coordinates, directional and
  conversation counts, first and last timestamps, provenance, completeness,
  and a canonical digest while excluding bodies, media, group messages,
  credentials, and local paths.
- Add `wrench beeper export-contact-interactions` plus the synchronous
  `@hraness/wrench/beeper` client for long-running local relationship imports.
  Its strict `{ receipt, output }` envelope binds the cleaned summary to the
  auth identity, requested bounds, linked-device transport, immutable Wrench
  release and verified official CLI pin, source versions, completeness, and
  counts.
- Pin Message Like Me v0.4.0 as the canonical bundle-v1 parser, type, limit,
  artifact-inventory, and current-manifest authority while preserving the
  checked legacy exporter bytes.
- Add async and synchronous `invokeCapability` clients that return Wrench's
  strictly parsed live receipt and output without requiring consumers to
  duplicate the CLI protocol parser.

## 0.13.6 - 2026-08-25

- Scrub JPEG and PNG provenance before X media upload, and fail closed when
  CreateTweet or independent TweetResultByRestId readback shows a Made with AI
  sparkle on user-supplied copy.
- Treat a mid-read optional admission rewrite after live I/O as an auth-changed
  discard so the live result cannot be published.
- Keep polling derivation-proxy readiness until the ready file is a complete
  0600 regular file, so an O_EXCL create cannot fail the start race.
- Add an authenticated, current-viewer-bound Twitch profile read that binds the
  fixed login-parameterized channel response to the viewer's immutable identity
  before returning its exact follower count.
- Promote the Hraness Twitch row from an expected categorical gap to the
  package-owned exact daily social-statistics workflow.

## 0.13.5 - 2026-08-24

- Add the Hraness Twitch channel to the package-owned social-statistics
  manifest with an exact-only categorical-gap contract until its reviewed
  capability and eligible authenticated source are available.

## 0.13.4 - 2026-08-24

- Add a credential-free, target-bound GitHub organization read that binds the
  organization and completes its bounded public repository pagination before
  projecting exact aggregate stars and followers.
- Preserve the existing GitHub profile read and document both public GitHub
  social-statistics routes for scheduled consumers.

## 0.13.3 - 2026-08-24

- Add a credential-free, target-bound GitHub profile read through the fixed
  public REST user endpoint, projecting exact follower, following, and public
  repository counts.
- Add GitHub to the package-owned Hraness social-profile-statistics workflow.

## 0.13.2 - 2026-08-23

- Publish exact Threads text through `posts.publish@5` without requiring a
  PNG, while preserving optional PNG publication and exact permalink readback.
- Restore exact LinkedIn personal and organization profile reads from a
  path-backed signed-in Chrome realm. Wrench clones the dormant profile into a
  private contained session, binds the current member before either target
  read, keeps personal profile and connection reads sequential, and finalizes
  the browser's private artifacts after every result.

## 0.13.1 - 2026-08-23

- Keep Beeper account selector aliases internal while returning plain,
  bounded-JSON-safe account projections from contact and messaging reads.

## 0.13.0 - 2026-08-22

- Add a pinned, read-only Beeper Desktop provider for contacts and messaging
  projections across locally connected accounts.
- Add `wrench beeper export-message-like-me` for private,
  provenance-preserving Message Like Me bundles with canonical digests,
  explicit completeness, graph validation, and no media downloads.
- Export Beeper accounts sequentially through the pinned official CLI with
  redacted account-level progress, elapsed-time heartbeats, and cumulative
  chat and message counts.
- Add durable process-aware recovery, global export admission, monitored raw
  working limits, and atomic validated Message Like Me bundle publication.
- Normalize account-local self aliases before record allocation, preserve
  distinct provider reaction facts, and reject contradictory identity or
  snapshot evidence without exposing private coordinates. Bound repeated
  participant work independently from output record cardinality.
