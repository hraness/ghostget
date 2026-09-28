# Substack subscriber operations

`substack-web` provides two observed read operations for the signed-in
owner's own publication. The one-address import remains `capture-required`:
Ghostget refuses it before reading cookies or opening a connection until
new-add readback and reconciliation are qualified.

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

- Input: `limit` from 1 to 100, `publication_origin`, and `cursor` only when
  continuing. Omit `cursor` for the first page; the input grammar has no
  `null`.
- Output: `subscribers` rows of `email` (lowercase), `subscriptionType`
  (`free`, `paid`, `comp`, `founding`, `gift`, or `unknown`), `subscribedAt`
  (UTC ISO-8601 with millisecond precision, or `null`; Substack sends nine
  fractional digits), and `sections` (sorted names, empty when the row
  names none); `nextCursor`; and `total`.
- The cursor binds the publication, the next offset, and the total seen on the
  first page. The next page starts ten rows before the end of the current
  one (one row after its start when a page holds ten or fewer), so adjacent
  pages overlap. Substack can reorder subscribers who share a signup time
  between requests, and the overlap lets such a row appear on at least one
  page. Page until `nextCursor` is `null`, deduplicate by `email`, then
  require the unique-address count to equal `total`. A changed total or a
  short page before the end fails closed; restart from the first page.

## `subscribers.import` (R3)

Ghostget refuses this operation before reading cookies or opening a
connection. The implementation behind the gate matches the add-by-email
request Substack's dashboard sends, so a later reviewed change can enable it
once a new-address add has been confirmed.

- Input: `emails` with exactly one address that is already lowercase and
  trimmed, the literal `send_welcome_email: false`, and the required exact
  `publication_origin`. Ghostget rejects any other value, an unnormalized or
  malformed address, or a second address before any cookie, keychain, or
  network access. A `publication_origin` the signed-in viewer does not own
  fails before dispatch.
- Request: one `POST <publication_origin>/api/v1/subscriber/add` with body
  `{"email": "<address>", "subscription": false, "sendEmail": false}`, sent
  once and never retried. The operation freezes one `operationId` before
  that dispatch and follows the normal R3 preview and one-use confirmation.
- Output on HTTP 200 with `{}`: `{"accepted": true, "operationId":
  "<sha256>"}`. This only means Substack acknowledged the request. Confirm
  the address with a fresh, complete `subscribers.export` census.
- Anything else after dispatch starts, including a 4xx, a 5xx, a network
  failure, a non-JSON body, or a body other than `{}`, returns
  `status: "indeterminate"` with an error beginning `reconcile-required:`. A
  4xx names its status in the error stage (`import-rejected, HTTP 400`).
  Ghostget never records a started dispatch as `failed`. Never retry that
  address; reconcile it through `subscribers.export` first.

## `subscribers.import.status` (R1)

- Input: an optional exact `publication_origin`; Hraness must supply
  `https://hraness.substack.com`.
- Output: exactly `total`, `isAdded`, `isSkipped`, `isLimited`, and
  `passImportVerification`, projected from the publication's latest import
  job. A response with any other key set fails as contract drift.

## Evidence and remaining qualification

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
flow. The ordinary 100-row stride repeated one subscription across pages,
leaving 372 unique addresses from a reported 373. A ten-row overlap
recovered all 373 unique addresses. The write remains capture-required
until a safe new-add readback and reconciliation contract is reviewed.
