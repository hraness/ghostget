# X contacts qualification

`contacts.list` is an observed contract. The `following` and `followers`
collections were qualified through the checkout's runtime on 2026-09-28 with an
authorized signed-in browser session (`cookie_source` locator; no cookie values
were printed or retained). No handles, display names, or user IDs appear in
this record.

## Observed operations

Descriptor evidence was extracted live from the web client's current main
bundle (`main.a9c37180a4c75840a.js`, observed 2026-09-28):

| Logical operation | Query ID | Method |
| --- | --- | --- |
| `Following` | `uwmIAx89XrXNuGY-Y7WFLg` | `GET` |
| `Followers` | `mrqxgX8JzwlL6pvYiC5CPA` | `POST` |
| `FollowersYouKnow` | `kSjQs8VV3c9WKxUoutJcrw` | discovered, not routed |

Both routed operations declare the same reviewed feature-switch and
field-toggle sets, all already mapped by the runtime. `FollowersYouKnow` is
recorded as evidence only; the contract keeps two semantic collections.

## Method evidence

`Following` returns 200 over `GET`. `Followers` returns an empty-body 404 over
`GET` and a populated 200 over `POST` with `{variables, queryId}` in the body.
The runtime pins each method exactly and fails closed on the other.

## Response shape and binding

Both responses root at `data.user.result.timeline.timeline`. The `User` owner
node echoes no identity fields in the observed responses, so binding is
structural: the request carries the authenticated viewer's `userId`, the
response must contain the reviewed `User` result node and timeline, and any
echoed identity fields must equal the viewer's ID. An explicitly mismatched
echoed identity is rejected.

Timeline entries normalize through the reviewed URT instruction set
(add/replace/pin/remove/clear/terminate). `TimelineUser` items project
`providerId`, `handle`, `displayName`, `followsViewer`, and `followedByViewer`
plus the shared directional-statistics shape (marked unavailable; the contract
returns identity and relationship flags only). Unavailable or non-user rows
are excluded from the contact projection.

## Relationship-perspective evidence

`legacy.relationship_perspectives` is the viewer's perspective on the listed
account, verified live: on the viewer's own `following` page every sampled row
carried `following: true` (the viewer follows them) and a subset carried
`followed_by: true` (they follow the viewer). On the `followers` page sampled
rows carried `followed_by: true`. The projection maps
`followedByViewer ← following` and `followsViewer ← followed_by`.

## Page-size and pagination evidence

- `limit=20` returned exactly 20 projected users per collection.
- The provider returns about 50 user entries per page regardless of the
  requested `count` (observed for `count` 20 and 100). The projection trims to
  the caller's bound and exposes no cursor when it truncates, per the
  over-limit cursor contract.
- Bottom cursors were present on non-truncated pages, forwarded verbatim on
  continuation, and produced a second page with zero ID overlap against the
  first (following page 2: 50 users; followers page 2: 49 users).
- Every sampled user row carried `rest_id`, screen name, and display name.

## Failure evidence

- A mismatched descriptor query ID fails before dispatch without adopting the
  drifted value.
- `TimelineUser` rows whose `user_results.result` is `UserUnavailable` or
  missing are projected as unavailable and excluded from contacts.
- An `echoed` owner identity that disagrees with the authenticated viewer is
  rejected as account mismatch.
