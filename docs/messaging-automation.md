# Owner messaging host

`ghostget messaging automation serve --stdio` is the trusted owner control port
for enrolled iMessage and WhatsApp conversations. It is never an agent tool.
All configuration, targets, message bodies and assets arrive on stdin; stdout
contains only protocol responses. Do not run it in a terminal or record its
streams in general logs. It does not pair accounts or start synchronization on
initialization.

Install the current bundled `imessage-direct` or `whatsapp-web` adapter, bind an
explicit existing Ghostget account, and enable managed operation permissions in
Ghostget. Grant `allow` separately to `messaging.automation.read`, the required
`messaging.automation.send.<kind>` operations, and (WhatsApp only)
`messaging.automation.sync`. An old `messaging.send` allow does not authorize this
host. `ask`, `deny`, and an unmanaged policy do not provide unattended authority.
Updated manifests and automatic implementation closures invalidate old grants.
These catalog entries cannot dispatch through generic `invoke` or `confirm`.

The private transport binaries are separate owner setup:

```sh
ghostget imessage transport install --json
ghostget whatsapp automation install --json
```

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

| Method | Exact params | Result |
| --- | --- | --- |
| initialize | providers: 1–2 `{provider,authId}`, distinct networks | `{initialized:true}` |
| status | provider | Current identity and permissions-intersected capabilities |
| start | provider | Current status; WhatsApp sync starts explicitly |
| conversations | provider, limit (1–200) | Current individual conversations |
| enroll | provider, coordinate | Exact identity/participants enrollment and historical baseline |
| enrollments | empty object | Persisted enrollments |
| grant | intentId, enrollmentId, expectedBindingDigest, actions, expiresAt, maximumActions, minimumIntervalMs | Bounded owner grant |
| grant.by-intent | intentId | `{grant}`; null only when no matching durable grant exists |
| grant.get | grantId | Current grant expiry, revocation and consumed quota |
| revoke | grantId | `{revoked:true}` |
| poll | enrollmentId | Refresh and admit new events; gaps remain explicit |
| history | enrollmentId, limit (1–200) | Stored admitted history and enrollment; no additional provider read |
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

Native iMessage links use the pinned `.3` helper and require the compatible
bridge to report `send.rich` available. The host sets `fetch_metadata: false`
to build a native URL/host-title card without helper metadata or image fetching.
This does not control all network behavior inside Messages or on the recipient
device. WhatsApp link sharing uses its existing text payload with preview
fetching disabled.
