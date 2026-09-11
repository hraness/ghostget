# Reviewed WhatsApp automation transport

This patch applies to `openclaw/wacli` commit
`a020de724180d31eccfa5241d45443402d62fb06` (v0.15.0). It is opt-in through
`sync --ghostget-private-transport`. Ordinary wacli commands retain their
existing behavior. Ghostget does not admit stock auto-retrying sends for its
automation contract.

The private socket carries fixed-schema JSON, bound to an exact account,
connection generation, direct recipient JID, and durable request ID. A claimed
request is never sent again; only an exact prior accepted receipt is returned.
Connection loss or an unfinished claim remains indeterminate. Acceptance means
the provider acknowledged the operation, not that the recipient received it.

Private sends make one joined application-level attempt and omit recipient
alias rewriting and URL previews. Text, document attachments, WebP stickers,
reactions and polls use existing pinned wacli operations. The upstream protocol
library may retransmit protocol frames with its own message ID. No account,
pairing, private-message or live-send qualification is implied by offline tests.

The private runtime installs SQLite triggers that journal message insert,
update and delete projections in the same transaction. A persistent generation
and monotonic sequence support resumption; retention is 10,000 events and
expired or changed anchors require a new baseline. Historical backfill keeps
its original timestamp. Consumers must apply their freshness policy before
replying. A single writer connection uses `synchronous=FULL`.

Build with Go 1.25.12, the unchanged committed module graph, a macOS arm64
toolchain, and the exact commands in `provenance.json`. The native binary is
bundled as compressed pinned bytes inside Ghostget's existing package archive.
Owner setup installs it with the exact-hash installer; it is not an additional
canonical package release asset. The supervised socket lives in its owned
private cleanup directory so long managed account paths remain usable.

Tests in the patch exercise a real private Unix socket using a synthetic
runtime, joined cancellation, one-attempt failure, exact replay, identity and
target mismatch, transactional events, cursor expiration and bounded retention.
Both complete upstream suites (plain and `sqlite_fts5`) and `go vet ./...`
passed. Two builds with identical flags produced identical bytes.
