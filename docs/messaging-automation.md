# Owner messaging host

`ghostget messaging automation serve --stdio` is the trusted owner control port
for enrolled iMessage, WhatsApp, and Beeper conversations. It is never an agent
tool.
All configuration, targets, message bodies and assets arrive on stdin; stdout
contains only protocol responses. Do not run it in a terminal or record its
streams in general logs. It does not pair accounts or start synchronization on
initialization.

The `@hraness/ghostget/messaging-automation` SDK exports the closed message,
grant, plan and receipt types, an explicit `createMessagingAutomationHost` for
trusted owner-supplied providers, and `installBundledMessagingRuntime`. Imports
are inert in Node and Bun; host construction requires Bun. Supplied providers
must enforce their own exact permissions and cleanup. Use the stdio host above
for Ghostget's built-in accounts and managed registry; its session factory is
internal and is not part of the SDK.

Install the current bundled `imessage-direct`, `whatsapp-web`, or `beeper-local`
adapter, bind an explicit existing Ghostget account, and enable managed
operation permissions in Ghostget. Grant `allow` separately to
`messaging.automation.read`, the required `messaging.automation.send.<kind>`
operations, and (WhatsApp only) `messaging.automation.sync`. Beeper admits exact
text sends only: `messaging.automation.send.text` is its sole send permission.
An old `messaging.send` allow does not authorize this
host. `ask`, `deny`, and an unmanaged policy do not provide unattended authority.
Updated manifests and automatic implementation closures invalidate old grants.
These catalog entries cannot dispatch through generic `invoke` or `confirm`.

The private transport binaries are separate owner setup:

```sh
ghostget imessage transport install --json
ghostget whatsapp automation install --json
```

Beeper has no bundled runtime: its transport is the separately installed pinned
`beeper` CLI against the running Beeper Desktop local API on its fixed loopback
target.

The default installs the exact compressed runtime included in the Ghostget package. An optional `--binary /absolute/reviewed-file` selects an explicit source instead. Only exact pinned bytes are accepted. Installation starts no helper. The
WhatsApp binary is the reviewed wacli build with durable events and exact action
claims; a stock wacli does not qualify. Existing account pairing and macOS
permissions remain Ghostget setup responsibilities.

Each newline-delimited JSON request is `{protocol,id,method,params}`, with
`protocol` exactly `ghostget.messaging-automation/1`. IDs are distinct active
ASCII identifiers of at most 64 bytes. Successful responses contain
`{protocol,id,ok:true,result}`; failures contain a bounded generic
`{protocol,id,ok:false,error:{code,message}}`. No diagnostic contains credentials,
provider state paths, or message contents. Clients must correlate IDs: priority
responses can arrive before a pending ordinary response.

iMessage coordinates preserve literal `iMessage;` and `any;` GUIDs up to 1024
bytes and require the observed service to be exactly `iMessage`. The native
Messages database uses `any;` for some iMessage chats; the prefix does not grant
SMS access. Discovery validates the entire native response before omitting
unsupported prefixes, larger GUIDs, or individual-conversation metadata outside
the owner's bounds. The page remains incomplete. Enrollment, history and sends
revalidate the exact GUID, row and service; no GUID is rewritten. A discovery
failure may carry the fixed
`ghostget.discovery.v1:<phase>:<code>` marker in `error.message` with the existing
`unavailable` code. These closed diagnostic categories contain no row indexes,
coordinates or provider error text; unknown failures keep the generic message.

iMessage history includes bounded attachment names, MIME types and byte sizes.
It never returns local paths or file contents and disables native conversion.
The native metadata query may check whether the stored file exists. Live event
pages and internal send-validation history keep attachment metadata disabled.

| Method | Exact params | Result |
| --- | --- | --- |
| initialize | providers: 1–3 `{provider,authId}`, distinct networks | `{initialized:true}` |
| features | empty object | `{groupConversations:{version:1}}` |
| status | provider | Current identity and permissions-intersected capabilities |
| start | provider | Current status; WhatsApp sync starts explicitly |
| conversations | provider, limit (1–200), optional includeGroups (boolean) | Current individual conversations; verified groups only when explicitly requested |
| enroll | provider, coordinate | Exact identity/participants enrollment and historical baseline |
| enrollments | optional includeGroups (boolean) | Persisted individual enrollments; groups only when explicitly requested |
| grant | intentId, enrollmentId, expectedBindingDigest, actions, expiresAt, maximumActions, minimumIntervalMs | Bounded owner grant |
| grant.by-intent | intentId | `{grant}`; null only when no matching durable grant exists |
| grant.get | grantId | Current grant expiry, revocation and consumed quota |
| revoke | grantId | `{revoked:true}` |
| poll | enrollmentId | Refresh and admit new events; gaps remain explicit |
| history | enrollmentId, limit (1–200) | Stored admitted history and enrollment; no additional provider read |
| history.window | enrollmentId, limit (1–200), before and after (nullable canonical UTC) | Individual provider history or group enrollment-local history within the window |
| events | enrollmentIds, cursor (nullable), limit (1–500) | Durable scoped event page |
| asset | bytesBase64, sha256 | assetId, byte count, digest, expiry |
| prepare | enrollmentId, expectedRevision, intentId, actions | Exact two-minute plan |
| submit | planId, grantId | Durable terminal/uncertain action receipt |
| cancel | planId | `{cancelled:boolean}`; join submit to learn its outcome |
| run | runId | Retained exact run receipt |
| close | empty object | `{closed:true}` only after cleanup joins |

Ordinary requests are serialized by the client; the server rejects a second
ordinary in-flight request. Cancel, revoke and close have a separate capacity of
eight and may interrupt a pending submit. Cancellation never proves that an
already-started action was unsent. Grant creation requires an owner-persisted intent ID; recover an uncertain response with `grant.by-intent` before doing anything else. Keep reading the original submit response,
and reconcile its exact run identity without resubmitting uncertain work.

Frames are bounded to 24 MiB; responses to 32 MiB. Assets use canonical Base64 and
a checked SHA-256, at most 16 MiB each, 64 MiB total and 32 entries. An unclaimed
asset lasts five minutes; prepare binds it to one plan's expiry, and only that
submit can resolve its bytes. Terminal submit removes its assets. Assets do not
survive restart and never accept arbitrary filesystem paths.

Every provider operation rechecks the account incarnation, exact implementation
identity and managed permission. Explicit sync keeps a durable cleanup admission
for the lifetime of the owned WhatsApp process; loss or revocation of its sync
allow closes the provider, checked at one-second intervals. iMessage operations
join and release their own admissions. A cleanup failure retains the existing
Ghostget recovery marker across restart. Never remove it or take over an unknown
socket merely because the parent process exited. The owner must use the existing
Ghostget recovery process to establish exact descendant and resource cleanup.

The host stores enrollments, grants, historical baselines, durable cursors and
action claims privately in the selected Ghostget state home. Source generation,
account or participant drift prevents continuation. Historical bootstrap does
not become a live event; possible gaps prevent automatic sends. Provider
acceptance is reported separately from delivery or read status. Available rich
actions depend on the current pinned helper and explicit permissions;
app-clips and arbitrary mini-app experiences remain unavailable.

Group conversations use the same protocol version and explicit grants. Clients
request `features` before sending `includeGroups:true`; omitting the flag keeps
both discovery and enrollment listings limited to individual conversations.
An older host may report an unavailable operation for `features`. This means
group support could not be established; clients can still request individual
conversations without negotiation. A malformed successful feature response is
an error, never permission to try a group operation.

A group binds its exact provider, account, coordinate, kind and complete sorted
roster of 1–500 distinct participant identities. WhatsApp groups use their exact
`@g.us` JID, including a legacy hyphenated JID when supplied; no recipient alias
is substituted. Beeper requires `hasMore:false` and an exact participant count.
A group has no self-chat privileges. Titles can change without changing authority.

Observed group binding drift permanently invalidates that enrollment.
Its original digest remains unchanged, `ready` becomes false, and `reason` is
`ghostget.binding-changed.v1`. Existing grants are revoked, prepared actions
cannot run, and restoring the old roster does not restore authority. Enroll the
group again to obtain a new ID and grant; each action also rechecks the complete
roster immediately before sending.

The pinned iMessage helper and Beeper's complete participant response can also
prove an explicit empty group roster. Their trusted adapters report
`AutomationGroupBindingChangedError` with the exact
account identity and coordinate; mutation paths validate that scope before
permanently disabling old group enrollments. This does not admit empty groups.
An omitted roster, partial response or failed lookup has no such authority.

Group history starts at enrollment. The host records a local time floor and
silently establishes the provider cursor without admitting baseline bodies.
Messages retain their original creation time through edits and backfill; a
group message older than the floor or later than the host's current receive
time is excluded. IDs encountered in the baseline or excluded history stay
excluded across restart. Edits, deletions and reactions cannot import the body
of an unknown older message. Group `history.window` reads only this enrollment's
admitted history, never the provider archive. A replacement enrollment receives
no history or memory from the former roster.

These checks rely on the reviewed provider preserving its original creation
timestamp, cursor and exact account semantics. They do not establish delivery,
detect an unobserved roster change that is restored between provider reads, or
protect against a compromised host or provider. Read-only listings and history
queries never update the journal; enrollment, polling and sending record drift.

Native iMessage links use the pinned `.3` helper and require the compatible
bridge to report `send.rich` available. The host sets `fetch_metadata: false`
to build a native URL/host-title card without helper metadata or image fetching.
This does not control all network behavior inside Messages or on the recipient
device. WhatsApp link sharing uses its existing text payload with preview
fetching disabled.
