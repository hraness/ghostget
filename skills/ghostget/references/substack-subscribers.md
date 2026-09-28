# Substack subscriber operations

`substack-web` reserves three operations for the signed-in owner's own
publication. All three are `capture-required` in this release: Ghostget
refuses them before reading cookies or opening a connection. They become
executable only after an authorized live capture proves each exchange and a
reviewed change marks the contract `observed`.

The auth locator binds one exact `substack:<user-id>` subject. Export names
one publication from that viewer's dashboard and checks its subscriber page
for matching author and administrator ownership. The disabled import and
import-status candidates require a single dashboard publication.

## `subscribers.export` (R1)

The source candidate uses export version 2. It reads the named owner's
publication directory in pages of at most 50 rows, with at most 500 rows in
one continuation chain. The published version 1 reservation does not accept
this format.

```sh
printf '%s' '{"publication":"your-publication","limit":50}' \
  | bun run ./src/cli.ts invoke substack-web subscribers.export --input - --auth substack-main --json
```

- Input: `publication` is the exact lowercase Substack handle, and `limit`
  is from 1 to 50. Omit `cursor` for the first page, then pass only
  the encrypted `nextCursor` returned by the previous page. Cursors bind the
  account, viewer, publication, ordering, first-page total, and rows already
  returned. Old unsigned cursors are rejected.
- Output: `subscribers` rows contain lowercase `email`, `subscriptionType`
  (`free`, `paid`, `comp`, `founding`, `gift`, or `unknown`), and `subscribedAt`
  (UTC ISO-8601 with millisecond precision, or `null`). The classification
  reflects the dashboard fields; it does not establish active delivery or
  consent. Section membership is unavailable and is omitted.
- `total` is the provider's directory count. A changed count or a repeated
  address stops the chain; restart from the first page. Duplicate detection
  uses encrypted fingerprints and may conservatively reject a collision.
- `complete` is always `false`, and `completeness.kind` is `page`. Offset
  pagination cannot prove a consistent snapshot: equal-count membership
  changes or reordered rows can omit addresses even when no repeat is found.
- `continuationSupported` is true only when another cursor is returned.
  A null `nextCursor` has `stopReason: "provider-exhausted"` when the returned
  count reaches the reported total, or `stopReason: "row-limit"` when the
  500-row limit stops the chain. Neither means a complete snapshot.

## `subscribers.import` (R3)

```sh
printf '%s' '{"emails":["reader@example.com"],"send_welcome_email":false}' \
  | ghostget invoke substack-web subscribers.import --input - --auth substack-main --json
```

- Input: `emails`, 1 to 25 unique addresses that are already lowercase and
  trimmed, and the literal `send_welcome_email: false`. Ghostget rejects any
  other value, a duplicate, an unnormalized or malformed address, or a 26th
  address before any cookie, keychain, or network access.
- The operation freezes one `operationId` before its single dispatch and
  follows the normal R3 preview and one-use confirmation.
- Output on success: `{"accepted": true, "operationId": "<sha256>"}`.
- Any failure after dispatch starts returns `status: "indeterminate"` with an
  error beginning `reconcile-required:`. Never retry that batch. Read
  `subscribers.import.status` and reconcile from its counts.

## `subscribers.import.status` (R1)

- Input: `{}`.
- Output: exactly `total`, `isAdded`, `isSkipped`, `isLimited`, and
  `passImportVerification`, projected from the publication's latest import
  job. A response with any other key set fails as contract drift.

## Remaining live qualification

Export is evaluated independently from import. Before export can run, an
authorized account test must confirm the selected publication and owner, the subscriber
request and response, 50-row pagination, and the observed end-of-data behavior.
Only the demonstrated read may be enabled.

Import and import-status require separate evidence. Import needs the exact
request, welcome-email suppression field, acceptance response, and effect on
the import status. Import-status needs its own response evidence. Both remain
`capture-required`; export evidence cannot enable either operation.
