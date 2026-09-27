# Microsoft Graph activation evidence

The Microsoft Graph plugin is a disabled source candidate, absent from the
published 0.18.43 package. Source, parser, HTTP-fixture,
package, and registry tests can admit the artifact without activating it.
Neither operation may be marked `observed` from those tests alone.

## Documented basis

Microsoft's v1.0 documentation was read on 2026-09-27:

- [List contacts](https://learn.microsoft.com/en-us/graph/api/user-list-contacts?view=graph-rest-1.0): default contact folder, delegated `Contacts.Read`, GET without a body.
- [List calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0): default-calendar occurrences, exceptions, and single instances; explicit time bounds; `$top` between one and 1,000; continuation links. The candidate caps pages at 100 rows.
- [Calendar permission table](https://github.com/microsoftgraph/microsoft-graph-docs-contrib/blob/main/api-reference/v1.0/includes/permissions/calendar-list-calendarview-permissions.md): delegated `Calendars.ReadBasic` for work/school and personal accounts.
- [Contact](https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0), [event](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0), and [attendee](https://learn.microsoft.com/en-us/graph/api/resources/attendee?view=graph-rest-1.0): selected field types, per-occurrence `iCalUId`, cancellation, hidden attendees, invitee resource type, optional proposed times, and the 500-attendee limit.

The candidate deliberately rejects response shapes outside its reviewed subset.
Graph may return a different legal continuation path or nullable shape; that
requires a reviewed parser update, not a bypass. The official API documentation
does not qualify this implementation's strict projection or pagination policy.

## Required before activation

1. Record authorization for one owner-selected Microsoft account and the exact
   read operations and calendar time window. Confirm the tenant/account kind and
   global-cloud target. Implementation work grants no authority to discover or
   import an existing locator, register an app, grant consent, or read the account.
2. Use an owner-supplied, appropriately authorized delegated credential through
   the existing schema-1 private token-file mechanism. Require `User.Read` plus
   the operation's exact read scope. No new token-renewal implementation or
   credential acquisition belongs to this candidate. Verify expiry and the
   locator/token provider, subject, and scope binding through the existing loader.
3. Prove the exact `/me` ID binding. Record sanitized account-kind evidence;
   keep the actual account identifier, token, and raw responses private. Exercise
   account mismatch and revoked or insufficient permissions without collection
   access or retry.
4. Confirm the selected fields, nullability, optional annotations, case-sensitive
   resource IDs, and `Prefer: IdType="ImmutableId"` behavior for contacts and
   calendar entries. Confirm no extra body, subject, address, attachment, or
   meeting-link fields are returned. Update the strict parser from the evidence
   if Graph returns additional documented metadata.
5. Capture at least two pages and a terminal page for each promoted operation.
   Confirm the actual next-link path, full selected-field/window preservation,
   `$skip` or `$skiptoken`, page-size ceiling, empty-page behavior, and response
   byte limits. Do not widen the URL policy to arbitrary Graph paths. Confirm
   the next page rechecks the account before reading its collection. Confirm
   current-token HMAC verification rejects an altered cursor and that token
   rotation requires restarting the traversal without storing a new secret.
6. For calendar activation, include a single instance, occurrence, exception,
   cancelled event where available, hidden attendees, a resource invitee, empty
   invitees, and an event spanning a window boundary. Confirm UTC time and
   fractional-second formats and null `seriesMasterId` for single instances.
   Document any unobserved case explicitly; retain its guard or scope limit.
7. Confirm that neither read sends invitations, changes read state, downloads
   media, or modifies provider data. Keep invitation membership distinct from
   attendance, distinguish terminal pagination from snapshot completeness, and
   require consumer deduplication across pages. Absence must never authorize
   deleting a contact or interaction.
8. Review sanitized evidence independently. Change only the qualified operation's
   contract state with its versioned semantic and durable identities, manifest,
   tests, and public status. Preserve zero-access tests for every operation still
   `capture-required`. Run current-candidate integration and package/install gates
   before release. Downstream consumers pin the resulting immutable release.

Live evidence stays outside Git. Commit only synthetic regressions and sanitized
conclusions that name the verified behavior, remaining limits, and reviewed
artifact identity. This document records AI-authored implementation guidance;
independent review is part of the implementation handoff, not a claim of live
verification.
