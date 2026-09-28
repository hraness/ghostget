# Substack export v2 qualification

Export v2 is a disabled source candidate. Import and import-status are separate
unqualified operations. No source, fixture, or package test enables them.

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

## Candidate behavior

- Public execution remains `capture-required` while the account and paging
  evidence is reviewed.
- The direct runtime requires a bound viewer and an explicit publication handle matching
  one dashboard entry. A separate read of that publication's subscriber page
  must bind the same viewer and publication through the observed author/admin
  fields. It admits only the selected publication's Substack origin.
- Export v2 returns at most 50 rows per request and 500 per continuation chain.
  AES-GCM cursors bind the operation version, selected account, viewer,
  publication origin and ID, initial total, and consumed rows. Old unsigned
  cursors and altered or cross-account tokens are rejected before cookie or
  network access.
- Encrypted, sorted 64-bit email fingerprints detect duplicates throughout
  the chain. Hash collisions fail closed. Count drift and changed ordering metadata
  fail closed. These checks cannot establish a consistent snapshot when
  equal-count membership changes omit rows.
- Every result has `complete: false` and `completeness.kind: "page"`.
  `stopReason` distinguishes the observed provider total from the 500-row
  limit. Exhausting a continuation does not certify collection completeness.
- Export v1 retains its original historical identity without becoming
  executable. Import and import-status remain disabled at version 1.

## Evidence required before activation

Retain a reviewed second-page and terminal-page exchange, qualify the signed-in
login probe, and exercise the installed Ghostget authentication and transport
path under its approved authorization. Browser-observed identity fields and
fixture replay do not qualify that transport. Review the exact current
request, response, paging limits, identity checks, and implementation before
changing either public execution registry to `observed`.

Keep approved raw evidence private and publish only structural findings,
counts, request shapes, and digests. Never enable import or import-status
from export evidence.

Authored by Codex. The captured projections were independently replayed by the
implementation worker; final code and evidence review remains with the
integration owner.
