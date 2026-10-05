---
type: plan
area: browser-verification
status: completed
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

## Result

- Delivered and verified: Lightpanda-first public semantic capture in
  Ghostget `v0.18.79` and Direct `v0.7.29`, released, mirrored
  byte-exact on npm, and promoted to production.
- LinkedIn authenticated Lightpanda read: **qualified for the identity
  read only.** One `/voyager/api/me` probe through the isolated
  Lightpanda session returned the exact same-account subject bound to
  `linkedin-main` (`subjectMatches: true`), with imported cookies,
  healthy containment, complete cleanup, and both auth realms
  byte-identical afterward. This contradicts the adapter note's earlier
  finding for that realm: a bound `cookie-source` handoff is accepted
  where whole-profile reuse is impossible. One read is not provider-wide
  qualification — profile, connections, and RSC contact reads each
  still need per-operation evidence before a Lightpanda transport can
  be offered.
- Chromium remains mandatory for visual evidence, attached or
  profile-backed sessions, connected accounts, and every authenticated
  provider read by default. Lightpanda authentication stays disabled
  unless a per-provider qualification like the one above passes.

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
