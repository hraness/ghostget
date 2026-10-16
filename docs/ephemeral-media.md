# Temporary media acquisition

`@hraness/ghostget/media-acquisition` is a local Bun SDK boundary. It does not
create a media archive or run transcription. Existing archive commands retain
all their previous semantics.

`acquireEphemeralMedia` accepts a finite item URL, existing canonical private
staging parent, optional saved `accountId` or selected browser plus auth realm, language, byte and
duration budgets, cancellation and progress. Ambient yt-dlp configuration is
always disabled. Authenticated requests never downgrade to a public route.
A saved account binds its exact browser selector and snapshot fingerprint; it is
re-read before the stage becomes ready. Unsupported account types and ambiguous
combinations of `accountId` with explicit browser/auth options fail closed.
Public direct audio uses the existing bounded HTTP transport and redirect rules;
other supported public items use yt-dlp. Live, playlist, upcoming and protected
unsupported items are rejected. Unknown provider duration is not qualified.

Timed provider captions are preferred when usable through the item duration.
This is a coverage check, not proof of complete or verbatim transcription; the
manifest explicitly records that limitation and manual/automatic provenance.
Otherwise acquisition requests audio-only, with no muxed-video fallback. FFprobe
checks finite duration and absence of video streams. The result lists hashes,
byte counts and relative paths of audio, WebVTT and thumbnail files. Source hashes
are identities, not a promise that source media remains available. A consumer
copies verified captions/transcription and thumbnails before cleanup.

The caller chooses a maximum up to 512 MiB, four hours and one acquisition hour.
Direct HTTP bytes are bounded before writes. yt-dlp receives a file-size limit;
its aggregate temporary storage is additionally **monitored**, every 100 ms,
with 16 KiB for receipts. This is not an OS disk quota: a write burst can exceed
the budget before the group stops. File inventory is capped at 256 entries.
Transcript and image files additionally have 8 MiB and 16 MiB limits.

## Ownership and cleanup

The private `media-UUID` directory contains a durable ownership receipt before
any media subprocess starts. The receipt binds the directory inode/device,
random token and acquiring owner PID. `cleanupEphemeralMedia` checks ancestry,
ownership and regular single-link files. It never receives a user media path.
A successful result intentionally has `cleanup: pending`: consumers still need
the files. Once external work has settled, its marker becomes `ready`; cleanup
then returns `settled` only after removal. Failure returns typed codes and
reports pending cleanup rather than pretending an uncertain stage was deleted.

For a supervisor-owned child group, use `processGroup: inherit` with the exact
`supervisor` request ID, group ID and OS start identity. This lets the supervisor
reap the complete group on cancellation/crash. An acquiring receipt is not
permission to kill any process. Recovery may pass an acknowledgment
`{custody: 'supervisor-reaped', supervisor}` only after that owner's process
custody checks succeeded. Ghostget checks the identity matches the receipt and
both acquiring PID and group are absent. Unknown custody, live/reused IDs,
malformed ownership or linked paths remain pending. No cleanup path sends a
termination signal. Unsupervised SIGKILL during acquisition remains pending;
PID absence alone is deliberately insufficient.

The receipt proves data ownership. The supervisor separately proves process
custody; these evidence boundaries must not be collapsed into a generic boolean.

Consumers should persist the successful cleanup response in their own operation
journal. An absent staging directory alone is not a cleanup receipt: it could
have been moved elsewhere, so a later cleanup call conservatively returns
`pending` when the original directory cannot be verified.
