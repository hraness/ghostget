# Substack subscriber operations

`substack-web` reserves three operations for the signed-in owner's own
publication. All three are `capture-required` in this release: Ghostget
refuses them before reading cookies or opening a connection. They become
executable only after an authorized live capture proves each exchange and a
reviewed change marks the contract `observed`.

The auth locator must bind one exact `substack:<user-id>` subject whose
dashboard lists exactly one publication on its own `<name>.substack.com`
origin. None of the operations takes a publication input, so a viewer with
several dashboard publications, or one reachable only through a custom domain,
fails as an account mismatch instead of choosing one.

## `subscribers.export` (R1)

```sh
printf '%s' '{"limit":500}' \
  | ghostget invoke substack-web subscribers.export --input - --auth substack-main --json
```

- Input: `limit` from 1 to 500, and `cursor` only when continuing. Omit
  `cursor` for the first page; the input grammar has no `null`.
- Output: `subscribers` rows of `email` (lowercase), `subscriptionType`
  (`free`, `paid`, `comp`, `founding`, `gift`, or `unknown`), `subscribedAt`
  (UTC ISO-8601 or `null`), and `sections` (sorted names, empty when the row
  names none); `nextCursor`; and `total`.
- The cursor binds the publication, the next offset, and the total seen on the
  first page. If the total changes mid-export the page fails; restart from the
  first page. Page until `nextCursor` is `null`, then require the summed row
  count to equal `total`.

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

Before promotion, one authorized capture must confirm the subscriber-list
request body, row fields, section field, page-size ceiling, and count
behavior; the import status response; and the exact import request, its
welcome-email suppression field, acceptance response, and effect on the import
status. The import request in this release is a candidate shape only.
