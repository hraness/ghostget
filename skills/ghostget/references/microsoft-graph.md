# Microsoft Graph contacts and calendar

This source candidate is absent from the published 0.18.43 package.
The `microsoft-graph-official` plugin reserves two read operations. Both are
`capture-required`: Ghostget rejects them before reading credentials or making
a network request. The implementation has synthetic tests; an authorized
account test and a reviewed code change are required before either operation
can run.

Inspect definitions from a source checkout containing this candidate:

```sh
bun run ./src/cli.ts plugin show microsoft-graph-official --json
```

## Proposed operations

| Operation | Input | Result | Required delegated scopes |
| --- | --- | --- | --- |
| `contacts.list` | Optional `limit` and `cursor` | One page from the default contact folder: names, email addresses, phone numbers, company, and job title | `User.Read`, `Contacts.Read` |
| `calendar.attendees.list` | Required `start` and `end`; optional `limit` and `cursor` | One page from the default calendar: event and occurrence IDs, UTC times, organizer, invitees, cancellation, and hidden-attendee flags | `User.Read`, `Calendars.ReadBasic` |

`limit` is an integer from one to 100 and defaults to 100. Calendar bounds use
`YYYY-MM-DDTHH:mm:ss.000Z`; `end` must follow `start` by at most 90 days.
An event must overlap the half-open window, including an event that starts
before it. An event of zero duration must start within the window.

Each call first checks `/v1.0/me?$select=id` against the exact
`microsoft-graph:<Graph user ID>` account, then requests one collection page.
It uses the global `graph.microsoft.com` service and immutable Outlook IDs.
The existing private schema-1 `oauth-token-file` format supplies the provider,
subject, exact scope list, access token, and expiry. Ghostget does not register
a Microsoft application, perform Microsoft sign-in, or refresh these tokens.
Do not look for, acquire, or import credentials merely to inspect this candidate.

## Coverage and limits

The contact operation reads only the default contact folder. The calendar
operation reads only the default calendar. Custom folders, shared calendars,
tenant directories, email, contact photos, and national-cloud endpoints are
outside these definitions.

Calendar results exclude subject, body, location, attachments, and online
meeting links. An invitee can be a person or a resource. Its response to an
invitation does not establish attendance or a personal relationship. Preserve
`isCancelled`, `hideAttendees`, attendee type, and response when interpreting
the result. A listed attendee collection does not prove all invitees were
visible. Repeated events retain their own ID, `iCalUId`, and `seriesMasterId`.

Follow only the returned `page.nextCursor` with the same account, operation,
page size, and calendar window. The cursor permits only the original endpoint
and selected fields. It rejects repeated pages and stops at 100 pages. An HMAC
protects the complete cursor using a key derived in memory from the current
access token. Replacing that token invalidates its cursors; restart from the
first page. A cursor does not contain the token and is not provider attestation.

`page.terminal` means the current response has no continuation. Every page
sets `snapshotComplete: false`: independently fetched pages are not an atomic
snapshot, and omitted rows must not cause deletion. Consumers must deduplicate
resource IDs across pages and retain partial results as partial.

Each call permits at most two HTTP requests, a 16 KiB identity response, and
a 4 MiB collection response and output. A calendar event permits at most 500
invitees, with at most 5,000 invitees across a page. Smaller caller budgets
remain effective. HTTP failures, changed accounts, malformed fields,
unexpected pagination, and excessive data fail without retrying.

Microsoft documents [listing contacts](https://learn.microsoft.com/en-us/graph/api/user-list-contacts?view=graph-rest-1.0),
[calendar views](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0),
[contact fields](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0),
and [event fields](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0).
These specifications support the candidate implementation; they do not verify
an account's permissions or its actual response shapes.
