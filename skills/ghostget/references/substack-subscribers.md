# Substack subscriber operations

`substack-web` reserves three operations for the signed-in owner's own
publication. All three are `capture-required` in this release: Ghostget
refuses them before reading cookies or opening a connection. They become
executable only after an authorized live capture proves each exchange and a
reviewed change marks the contract `observed`.

The auth locator must bind one exact `substack:<user-id>` subject. A viewer
with several dashboard publications must pass the exact
`publication_origin` in each operation's input. It must match one publication
listed in the signed-in dashboard and use its own `<name>.substack.com`
origin. A missing or ambiguous match fails as an account mismatch. The Hraness
locator is `substack-chrome`, and its publication origin is
`https://hraness.substack.com`.

## `subscribers.export` (R1)

```sh
printf '%s' '{"limit":50,"publication_origin":"https://hraness.substack.com"}' \
  | ghostget invoke substack-web subscribers.export --input - --auth substack-chrome --json
```

- Input: `limit` from 1 to 100, and `cursor` only when continuing. Omit
  `cursor` for the first page; the input grammar has no `null`.
- Output: `subscribers` rows of `email` (lowercase), `subscriptionType`
  (`free`, `paid`, `comp`, `founding`, `gift`, or `unknown`), `subscribedAt`
  (UTC ISO-8601 or `null`), and `sections` (sorted names, empty when the row
  names none); `nextCursor`; and `total`.
- The cursor binds the publication, the next offset, and the total seen on the
  first page. If the total changes mid-export the page fails; restart from the
  first page. Page until `nextCursor` is `null`, then require the summed row
  count and unique-address count to equal `total`; a repeated address means
  the census is incomplete even when the total stays fixed.

## `subscribers.import` (R3)

The candidate input has exactly one normalized address and the literal
welcome-suppression flag, but it is not an executable provider contract.

- Candidate input: `emails`, exactly one address that is already lowercase and
  trimmed, and the literal `send_welcome_email: false`. Ghostget rejects any
  other value, a duplicate, an unnormalized or malformed address, or a second
  address before any cookie, keychain, or network access.
- The candidate operation freezes one `operationId` before its single dispatch and
  follows the normal R3 preview and one-use confirmation.
- Candidate output on success: `{"accepted": true, "operationId": "<sha256>"}`.
- Any failure after dispatch starts returns `status: "indeterminate"` with an
  error beginning `reconcile-required:`. Never retry that batch. Read
  `subscribers.export` and reconcile the exact address before any later action.

## `subscribers.import.status` (R1)

- Input: an optional exact `publication_origin`; Hraness must supply
  `https://hraness.substack.com`.
- Candidate output: exactly `total`, `isAdded`, `isSkipped`, `isLimited`, and
  `passImportVerification`, projected from the publication's latest import
  job. A response with any other key set fails as contract drift.

## Remaining live qualification

Chrome captured the list request with `includeTags: true`, `limit: 50`,
`offset: 0`, and the descending subscription-date filter. A bounded
read-only probe accepted a limit of 100 and rejected 101. It also observed
that the import-status read uses `GET /api/v1/import/instances` with a nested
`latestImportResult`. The add-by-email control sent exactly one authorized
address to `POST /api/v1/subscriber/add` with
`subscription: false` and `sendEmail: false`. It returned HTTP 200 with an
empty object. A later full read placed that address's subscription well
before the add request, so the capture did not prove a new-address effect.
The file-import status did not change and cannot reconcile this add-by-email
flow. One full read reported 373 rows but repeated one subscription across
pages, leaving 372 unique addresses. The write remains capture-required
until a safe new-add readback and reconciliation contract is reviewed.
