---
type: plan
area: browser-verification
status: in-progress
---

# Prefer provisioned Lightpanda for public semantic capture

Adopt Lightpanda 1.0 as the preferred engine for eligible public
semantic/text browser work when explicitly provisioned, while keeping
Chromium authoritative for visual, layout, geometry, media, downloads,
authenticated, profile-backed, and unsupported workflows.

## Decision and scope

Lightpanda 1.0 has no graphical renderer: its PNG/PDF output renders
extracted text, not the page, and element geometry is simulated. It
therefore cannot verify layout, visibility, or visual regression. It can
execute semantic DOM checks, dynamic interactions, cookies, and session
storage at roughly 11–12.5× lower child-process RSS in the measured
three-page sample, without a consistent speed advantage. Memory savings
alone justify preferring it for semantic capture; they do not establish
rendering parity.

Routing is capability-based, not try-and-retry. Public automatic text
captures prefer a provisioned Lightpanda 1.0.0 binary
(`GHOSTGET_LIGHTPANDA_PATH` / `LIGHTPANDA_PATH`, exact version verified
at `/json/version` against the owned loopback CDP endpoint). Visual,
authenticated, profile-backed, connected-account, multi-target, media,
download, and expanded captures select Chromium before running.

Fallback to Chromium is bounded: only a recognized
`LightpandaCompatibilityError` raised before navigation, only for
automatic requests, and only within the remaining original timeout.
Assertions, security denials, identity mismatches, cleanup failures,
timeouts, arbitrary driver errors, and potentially completed
state-changing operations are never retried.

Containment is preserved end to end: a task-owned loopback HTTP proxy is
the only upstream, ambient proxy and `LIGHTPANDA_*` environment
variables are filtered, non-HTTP schemes (ws, wss, file, ftp, gopher,
data, javascript, blob) are blocked, inherited Chromium/auth config is
rejected, and process custody ends with SIGTERM, a bounded wait, and
SIGKILL escalation plus a parent-exit backstop.

## Verification evidence

- Ghostget `v0.18.79` ([PR #543](https://github.com/hraness/ghostget/pull/543),
  merge commit `6a7cd212cd5954bbec5c01174d37a91ba46417c9`): merged-commit
  CI, Release workflow, and CodeQL all successful.
- Canonical GitHub Release published with the five-asset contract
  (tgz, npm-pack.json, release-manifest.json, SHA256SUMS,
  provenance.jsonl). Independently verified: release tgz sha256
  `90999b933c87de6f04be067f95043867fd101f50f55cdd5a7fb0f55d3b092f9f`
  matches `SHA256SUMS`, and the npm registry tarball is byte-identical
  (same sha256; sha512 matches the published `dist.integrity`).
  `latest` is `0.18.79`.
- Production promotion succeeded on descendant `026894f5`; ghostget.com
  serves `0.18.79`.
- Native comparison: identical public text between Lightpanda and
  Chromium (133-word fixture), HTTPS proxying, synthetic
  cookie/session isolation, blocked foreign requests, real Chromium
  screenshots, complete cleanup.
- Regression: 150/150 focused tests, 181 website tests, package workflow
  and support/release checks, byte-identical independent pack
  measurements (packed 12,230,572 B pre-merge; canonical release asset
  12,242,299 B after the concurrent website merges).
- Direct `v0.7.29` carries the paired verification lane and the
  proxy-authority fix; install docs point at the verified archive
  ([PR #84](https://github.com/hraness/direct/pull/84), merged).

## Authenticated session handoff experiment

The user asked whether authenticated reads could transfer to Lightpanda.
Qualification, bounded to read-only evidence:

- Synthetic fixtures proved the handoff mechanisms: both the
  driver-level `cookies set` batch and Lightpanda's native `--cookie`
  JSON import authenticated a local fixture, preserved HttpOnly
  (JavaScript `document.cookie` could not read it), and preserved
  SameSite, path, and expiry on the native path. Cleanup completed.
- One live LinkedIn attempt was made against an isolated Lightpanda
  session using only the already-bound, same-account cookie-source
  realm `linkedin-chrome-current-20260817` (same subject as
  `linkedin-main`). No session material was copied to disk, no provider
  writes were issued, and the auth realms were verified unchanged
  afterward. See Result for the outcome.

## Engine-aware contained sessions and the LinkedIn default

The follow-on integration adds a `BrowserEngineSelection`
(`"chrome" | "lightpanda" | "auto"`) option to `createBrowserSession`,
reusing the full custody contract — artifact roots, socket directory,
task-owned proxy, cleanup journal, stdin cookie seeding, operation
deadlines, and recovery handles — rather than a parallel session path.
`"auto"` resolves to Lightpanda only when the auth realm yields explicit
cookies (`cookie-source`, `cookies-file`, or `browser-profile` with an
attached `cookieSource` and no `storageState`) **and** a validated
Lightpanda 1.0.0 binary is provisioned; everything else resolves to
Chromium. Automatic fallback to Chromium fires only on a recognized
`LightpandaCompatibilityError` raised before navigation, within the
original deadline. Provider rejections such as a LinkedIn 401 never
fall back.

Lightpanda global arguments keep `--config`, `--session`,
`--content-boundaries`, `--max-output`, `--action-policy`, and the plain
task-owned `--proxy` URL; Chromium-only flags (`--profile`, `--state`,
`--headed`, `--executable-path`, `--allowed-domains`, launch `--args`)
stay off. Cookies seed through the driver's stdin batch so values never
enter `argv`. First-party context after import opens the reviewed
origin's `/robots.txt` (the same realm page Chromium uses pre-cookie)
rather than a signed-in root that redirects to `/feed` and can
challenge a fresh automated session.

`createLinkedInProfileBrowserTransport` threads `engine` through
`LinkedInWebExecutionOptions` and defaults to `"auto"`, making
Lightpanda-first the default for its qualified funnel: identity probe,
personal-profile stats, connections, and organization reads. Contact
reads pin Chromium at their call site: the overlay harvests live
`network requests` bindings, and Lightpanda's well-formed empty response
has not been proven to report in-flight requests. Article, comment,
post, feed, and search transports keep the unqualified Chromium
default. An explicit `engine: "chrome"` pins the old lane.

### Live qualification evidence for the LinkedIn lane

- Adapter probe (`browser-profile` + live `cookieSource`): two
  consecutive green runs on real auth — exact same-account subject from
  `/voyager/api/me`, 915,578-byte profile HTML, 857,941-byte connections
  HTML, stable session, healthy containment, complete cleanup, both auth
  realms byte-identical.
- Integrated `createBrowserSession` run: `auto` resolved to Lightpanda,
  launched, seeded cookies via stdin batch, opened `/robots.txt`,
  closed, and preserved the realm. The identity read returned
  `provider-response-401`.
- Discriminator: with the **same** freshly acquired cookie snapshot,
  a plain HTTP `GET /feed/` returned a 302 authwall bounce while
  Lightpanda returned the same 401 — and the previously-green adapter
  then reproduced the same 401. The Chrome session itself had become
  invalid in the interval; all session-path 401s are dead-auth noise,
  not an engine or integration defect. No engine makes a dead session
  succeed.
- `network requests` returned a well-formed empty list in Lightpanda,
  but whether it reports in-flight requests is unproven — the contact
  overlay's request-binding harvest stays on Chromium until observed.
  Synthetic fixtures covered cookie import fidelity.

### Cleanup admission under a durable publisher

An independent review found the first integration could not survive the
production authenticated-read path: cleanup admission publishes a durable
resource identity, and the live control-witness binder requires
`engine: "chrome"` plus `browserLaunched: true`. A CDP-attached Lightpanda
session reports `engine: "lightpanda"` and `browserLaunched: false`, so it
could never bind. The remediation:

- The control-witness bind is now engine-gated (`chrome` only). Lightpanda
  sessions publish `prepared` then `launch-intent` and stay unbound.
- Launch-intent quiescence is engine-agnostic: it checks the daemon's
  exact `active` flag and session/socket identity pins, so an
  active-while-settling Lightpanda session retries inside the bounded
  convergence window instead of hard-failing the strict Chrome parser.
- `auto` with a publisher runs a throwaway preflight before the durable
  `prepared` publish — spawn, `open about:blank`, one stdin cookie import,
  `close`, serve-child reap, and a daemon-observed `inactive` check on
  unpublished roots. A protocol incompatibility resolves to Chromium
  before any durable identity exists; a post-publish compat failure can
  never register a second identity and fails closed.
- Executable resolution is gated on the selected engine, so a stale
  `LIGHTPANDA_PATH` cannot break unrelated Chromium sessions.

A live run through `createBrowserSession` under a publisher against the
real driver and a cookies-file realm completed `prepared` →
`launch-intent` publication, `journal-quiescent`, and both root-removal
journal entries, with every private root deleted. A second live run with
no provisioning env resolved `auto` to Chromium, confirming the graceful
degradation leg.

A second review round hardened the preflight itself:

- The inactivity proof now runs only after a fully successful probe —
  a probe failure already decided the outcome, and running it could wrap
  the compat error in an `AggregateError` the `instanceof` fallback check
  cannot see. Quiescence proof uses the production
  `convergeBrowserCleanupResourceProof` (10s bounded window, settling
  retries, exact identity pins) instead of an ad-hoc 2s poll, with inner
  command timeouts clamped to the remaining operation deadline.
- A daemon that can never prove the closed session inactive is now
  classified as a protocol incompatibility — settling-class failures
  become a bare `LightpandaCompatibilityError` so `auto` still resolves
  to Chromium, while the unproven throwaway roots are preserved rather
  than deleted. Identity, boundary, and malformed-output faults stay
  fail-closed.
- Proxy creation is tracked through `networkProxyCreation.pending` and
  closed late in teardown, mirroring the contained-session path, so a
  deadline abort cannot leak a live loopback listener.
- The owned serve-child reap uses a dedicated 6s bound because
  `lightpanda.close()`'s own worst case (~1s SIGKILL grace + 3s exit
  wait) exceeds the generic 2s resource-teardown bound.
- `close()` sets `acknowledged` only after the reap succeeds, so a reap
  failure stays open and retryable through the launch-intent recovery
  instead of being masked.

A third review round verified every remediation in code and found one
remaining minor defect, now fixed: the LinkedIn transport's one-shot
`initialBatchPending` rewrite flag was consumed by any command,
including stdin-free lifecycle invokes such as the preflight's
quiescence `session info` probe. A Chromium fallback after that probe
would have navigated to the signed-in root directly instead of warming
the realm page first. The flag now clears only when an invocation
carries a stdin batch.

Note: cookie replay into a contained browser is not novel risk — the
Chromium lane already seeds the same acquired cookies for
`browser-profile + cookieSource` auths. The session invalidation window
overlapped other signed-in-browser lane work, so attribution to the
Lightpanda reads is not supported by the evidence.

## Result

- Delivered and verified: Lightpanda-first public semantic capture in
  Ghostget `v0.18.79` and Direct `v0.7.29`, released, mirrored
  byte-exact on npm, and promoted to production.
- LinkedIn authenticated Lightpanda reads: **qualified for identity,
  personal stats, connections, and organization reads.** Live adapter
  evidence covered identity, profile HTML, and connections HTML on real
  auth; unit tests cover engine selection, fallback, custody, and
  seeding. The profile transport defaults to `"auto"` — Lightpanda
  first for cookie-yielding realms with a provisioned binary, Chromium
  otherwise. Contact reads stay on Chromium pending live
  network-request-observation evidence. This contradicts the adapter
  note's earlier finding for that realm: a bound `cookie-source`
  handoff is accepted where whole-profile reuse is impossible.
- Residual live gap: the integrated session path (including durable
  cleanup admission) is now mechanically green — a publisher-enabled
  Lightpanda session published, journaled, and removed every private
  root against the real driver. The identity read still lands inside
  the dead-session window, so one provider-200 run through the
  integrated path is pending re-authentication; `engine: "chrome"`
  remains the documented escape lane.
- Chromium remains mandatory for visual evidence, attached or
  profile-backed sessions, connected accounts, and the unqualified
  LinkedIn transports (article, comment, post, feed, search) and all
  other providers by default.

## Durable memory

- Lightpanda is a semantic capture optimization, not a browser
  replacement. "Low memory" is not rendering compatibility; visual
  evidence always belongs to Chromium.
- The auth handoff mechanism works (proven synthetically), but provider
  acceptance is the real gate: LinkedIn must corroborate the exact
  same-account identity before any authenticated Lightpanda read is
  trusted.
- macOS limits Unix-domain socket paths to ~104 bytes: `AGENT_BROWSER_SOCKET_DIR`
  must be a short path under `/tmp` (e.g. `mkdtempSync("/tmp/lp-")`),
  not inside the per-user tmpdir tree.
- The driver-level `open` is a navigation: `about:blank` is the only
  non-HTTP(S) target allowed, and batch `--allowed-domains` filtering
  is not wired for the Lightpanda global arguments — the task-owned
  proxy enforces containment instead.
- When an authenticated read fails, prove the session is alive before
  suspecting the engine: replay the same acquired cookies over plain
  HTTP. Identical rejection across transports means dead auth, not an
  engine defect — and three consecutive session-path 401s cost real
  qualification time before this was checked.
- Post-cookie first-party context should be a cheap realm page
  (`/robots.txt`), never a signed-in root: heavyweight landings can
  challenge fresh automated sessions before any in-page request runs.
- A CDP-attached browser has no daemon-launched process for the
  controlled cleanup witness — `session info` reports
  `browserLaunched: false` and a non-Chrome engine even while its owned
  serve child runs. Quiescence must be proven at the launch-intent
  phase from daemon-observed inactivity after close plus serve-child
  reap, and an `auto` selection with a publisher must preflight
  compatibility before the durable identity exists, because a retry's
  fresh identity can never register afterward.
- Keep executable resolution gated on the selected engine: validating an
  unrelated engine's environment lets a stale `LIGHTPANDA_PATH` break
  Chromium sessions that never asked for it.
- A one-shot command wrapper that keys on batch stdin must clear its
  armed flag only when a batch actually arrives: stdin-free lifecycle
  invokes (`session info`, preflight probes) otherwise consume the
  rewrite before the navigation it protects.
- On the Lightpanda lane, `session.runBatch` puts each command on
  process argv while the Chromium lane sends one stdin payload — cookie
  values must always take the `dependencies.runBatch` stdin channel, and
  future callers must not seed cookies through `session.runBatch`.
