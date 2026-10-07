# Substack subscriber operations

`substack-web` can export the subscribers of a publication the signed-in
owner runs, read that publication's latest import counts, and add one
subscriber at a time without a welcome email.

The auth locator binds one exact `substack:<user-id>` subject. Every
subscriber operation names one `publication` handle from that viewer's
dashboard, such as `hraness`. Before any subscriber request, GhostGet reads
that publication's subscriber page and requires the viewer to be its author
and an administrator. A missing, ambiguous, or unowned publication fails as
an account mismatch.

## `subscribers.export` (R1)

```sh
printf '%s' '{"publication":"hraness","limit":100}' \
  | ghostget invoke substack-web subscribers.export --input - --auth substack-chrome --json
```

- Input: `publication`, `limit` from 1 to 100, and `cursor` only when
  continuing. Omit `cursor` for the first page, then pass the encrypted
  `nextCursor` from the previous page unchanged. A cursor works only for the
  same auth locator, viewer, and publication.
- Output: `subscribers`, `nextCursor`, `total`, `complete`, `completeness`,
  `continuationSupported`, and `stopReason`. Each row has exactly `email`
  (lowercase), `subscriptionType` (`free`, `paid`, `comp`, `founding`, `gift`,
  or `unknown`), and `subscribedAt` (UTC ISO-8601 with millisecond precision,
  or `null`; Substack sends nine fractional digits). Section membership is not
  returned.
- Each page after the first starts up to ten rows before the end of the
  previous one. Substack can reorder subscribers who share a signup time
  between requests, and a plain 100-row stride once missed one of 373
  addresses. GhostGet drops rows the chain already returned, so each page
  lists only new addresses.
- Keep paging until `nextCursor` is `null`. The last page has
  `complete: true` and `stopReason: "provider-exhausted"` only when the
  chain returned exactly `total` unique addresses. Otherwise `complete` is
  `false` and `stopReason` is `"census-mismatch"` (start over) or
  `"row-limit"` (one chain covers 2,000 rows, so larger lists can't be
  exported completely yet). Intermediate pages have `complete: false` and
  `stopReason: null`.
- A changed `total`, a repeated address within one page, a short page
  before the end, or changed ordering stops the chain; start over from the
  first page. `complete` compares counts, so a subscriber swap that keeps
  `total` the same can go unnoticed. Compare two censuses when you need a
  snapshot.

## `subscribers.import.status` (R1)

```sh
printf '%s' '{"publication":"hraness"}' \
  | ghostget invoke substack-web subscribers.import.status --input - --auth substack-chrome --json
```

- Input: `publication`.
- Output: exactly `total`, `isAdded`, `isSkipped`, `isLimited`, and
  `passImportVerification` from the publication's latest import job. A
  one-address add also replaces that latest job, so these counts cannot
  confirm a specific address. Use a fresh export census for that.

## `subscribers.import` (R3)

```sh
printf '%s' '{"publication":"hraness","emails":["reader@example.com"],"send_welcome_email":false}' \
  | ghostget invoke substack-web subscribers.import --input - --auth substack-chrome --json
```

- Input: `publication`, `emails` with exactly one address that is already
  lowercase and trimmed, and the literal `send_welcome_email: false`. Anything
  else fails before any cookie, keychain, or network access.
- Before sending, GhostGet checks author and administrator ownership and
  freezes one `operationId`. The operation follows the normal R3 preview and
  one-use confirmation.
- It sends one `POST <publication>/api/v1/subscriber/add` with
  `{"email": "<address>", "subscription": false, "sendEmail": false}` and
  never retries it.
- HTTP 200 with `{}` returns `{"accepted": true, "operationId": "<sha256>"}`.
  That only means Substack acknowledged the request; confirm the address with
  a fresh export census. The added address took between 8 and 18 minutes to
  appear in the export, so keep checking later censuses before treating it as
  missing.
- Anything else after sending, including a 4xx, a 5xx, a network failure, a
  non-JSON body, or a body other than `{}`, returns `status: "indeterminate"`
  with an error beginning `reconcile-required:`. A 4xx names its status in the
  error stage, for example `import-rejected, HTTP 400`. GhostGet never records
  a sent request as `failed`. Never retry that address; check a fresh census
  first.

## Evidence

On 2026-09-28 the checkout's CLI, using an isolated development state and
the `substack-chrome` locator, exported the Hraness publication in five
pages (100, 90, 90, 90, and 3 new rows) and returned 373 unique addresses
for a reported total of 373, with `complete: true`. The import-status read
returned the five-count projection.

One authorized qualification add sent a confirmed, eligible Hraness opt-in
that the fresh census did not contain. Substack answered HTTP 200 with `{}`,
and the latest import job changed from one skipped address to one added
address. Censuses right after the add and four and eight minutes later still
reported 373 addresses. A complete census 18 minutes after the add reported
374 unique addresses of 374, including the new one, which reconciled the
add.
