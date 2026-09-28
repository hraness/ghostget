# Substack subscriber qualification

Export v2 and import-status v2 are observed contracts, qualified through the
checkout's installed CLI path on 2026-09-28. Import v2 remains
`capture-required` because its one qualification add has not been reconciled.
The sections below keep the original export capture evidence, then record the
installed-path qualification and the import attempt.

## Observed request and response

The authorized owner-account browser capture on 2026-09-27 observed a JSON
200 response to the publication dashboard's `POST /api/v1/subscriber-stats`.
The body was:

```json
{"filters":{"order_by_desc_nulls_last":"subscription_created_at"},"limit":50,"offset":0,"includeTags":true}
```

The privately retained first-page projection has SHA-256
`4bf49daa3acb5aa40c808a6285f2f848362fbb2084dd7610342a0ce746741a03`.
It contains 50 rows and a directory count of 373. The response's order is
`{"by":"subscription_created_at","direction":"desc"}`. Replaying this
projection through the candidate parser succeeds without contact values in
test output or source control.

The observed rows use `user_email_address`, `subscription_created_at`, and
`subscription_interval`. Signup timestamps include nine fractional digits
and a UTC offset. All sampled interval values are `free`; the flags for
founding, gift, and complimentary classification are false. Non-free
classification branches have deterministic fixtures, but still require their
own observed response evidence before those classifications are qualified. The sampled
`is_subscribed` value is also false while the dashboard labels the entries
Free, so the export does not infer active delivery, consent, or unsubscribe
status from that flag. Section membership is absent and is omitted.

Names, avatars, activity, revenue, provider row identifiers, tags, and import
metadata are excluded from the retained projection and exported rows.

## Account and pagination evidence

A separate private projection of the already loaded account and publisher
preloads has SHA-256
`040cae299d0f5e5fb93b7ba184700c429ba19cc7e6d05e8bd07d83f275c6bf7c`.
The central dashboard lists two publications. Its selected entry has
`primary_user_id: null` and false primary-user flags. Those fields therefore
cannot qualify this account's owner binding.

The selected publication's subscriber page instead exposes matching viewer
and publication IDs, `pub.author_id` equal to the viewer, `user.is_admin` and
`user.is_author` true, and `user.is_ghost` false. Its `pub` and `publication`
objects agree on the publication ID and subdomain. The production parsers
successfully replay these projected fields, selecting the captured central
entry and verifying the separate publisher binding. The other publication's
private metadata is not retained in this replay.

The capture owner also observed a second 50-row page at offset 50 with the
same total and no overlapping emails. That response was not retained as a
replay fixture, so this change does not claim independent verification of it.
The approved browser navigation to the login probe was blocked; no bypass or
cookie extraction was attempted. An installed Ghostget transport invocation
and a terminal provider page remain unqualified.

## Export behavior

- The direct runtime requires a bound viewer and an explicit publication
  handle matching one dashboard entry. A separate read of that publication's
  subscriber page must bind the same viewer and publication through the
  observed author/admin fields before any subscriber exchange, including
  import-status and import.
- Export v2 returns at most 100 rows per request; the dashboard accepted 100
  and rejected 101. One continuation chain covers provider positions below
  500, which keeps the sealed cursor's fingerprint set under the 8,192-byte
  token bound and covers the qualified 373-row publication.
- AES-GCM cursors (payload schema 3) bind the operation, auth locator,
  viewer, publication origin and ID, first-page total, next provider offset,
  and sorted fingerprints of every address already returned.
- Each continuation rewinds up to ten rows. The dashboard reorders rows that
  share a signup instant between requests: a plain 100-row stride once
  returned 372 unique addresses for a total of 373, while a ten-row overlap
  recovered all 373. Rows the chain already returned are dropped, so each page
  lists only new addresses. A repeat within one page, count drift, a short
  page before the end, and changed ordering fail closed.
- The last page reports `complete: true`, `completeness.kind: "census"`, and
  `stopReason: "provider-exhausted"` only when the chain's unique addresses
  equal the reported total. An exhausted chain with any other count reports
  `census-mismatch`, and the 500-row bound reports `row-limit`; both keep
  `complete: false`. A count match cannot detect an equal-count membership
  swap.
- Export v1, import v1, and import-status v1 keep their original identities
  as separate disabled routes.

## Installed-path qualification

On 2026-09-28 the checkout's CLI (`bun src/cli.ts invoke`) ran against an
isolated development state with a fresh `substack-chrome` cookie-source
locator bound to the owner's subject. `subscribers.export` with
`{"publication":"hraness","limit":100}` returned five pages with 100, 90, 90,
90, and 3 new rows. The chain returned 373 unique addresses for a reported
total of 373 and ended with `complete: true` and `provider-exhausted`. Every
row had exactly `email`, `subscriptionType`, and `subscribedAt`.
`subscribers.import.status` with `{"publication":"hraness"}` returned the
five-count projection from `GET /api/v1/import/instances`. No address, cookie,
or response body was recorded.

## Import qualification attempt

Import v2 sends the dashboard's observed add request: one
`POST /api/v1/subscriber/add` with `{"email", "subscription": false,
"sendEmail": false}`, after the owner binding, once, never retried. HTTP 200
with `{}` is only an acknowledgement. Any other outcome after dispatch is
`indeterminate` with `reconcile-required:`, because a started dispatch can
never finish as `failed`.

One authorized qualification add ran through the gated runtime, not the
public dispatcher, at 2026-09-28T02:47:36Z. It used the oldest confirmed,
unsuppressed, Substack-eligible Hraness opt-in absent from a fresh complete
census. Substack returned HTTP 200 with `{}`.
The latest import job changed from one skipped address to one added address.
Complete censuses right after the add and about eight minutes later still
reported 373 addresses without it. The add is unreconciled, so import stays
`capture-required`. Do not retry that or any other address. A later census
that contains that address with a one-address increase and every earlier
address preserved would be the reconciliation evidence for promotion.

## Evidence required before import activation

A fresh complete census must contain the qualification address, report one
more unique address than the pre-add census, and preserve every earlier
address. Only then can a reviewed change mark import `observed`.
Import-status counts cannot confirm a specific address.

Authored by Devin. Keep approved raw evidence private and publish only
structural findings, counts, request shapes, and digests.
