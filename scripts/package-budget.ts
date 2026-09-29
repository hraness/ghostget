// Enrollment-scoped automation lanes change the owner-normal admission in
// src/messaging-automation-server.ts (per-enrollment ordering for
// poll/history/prepare/grant/submit), add the planEnrollment lookup to
// src/messaging-automation.ts, and rebuild the messaging-automation-api dist
// chunk: two changed packed sources plus their rebuilt bundles over the
// unchanged 598-file inventory. A clean `npm pack --ignore-scripts` with
// npm 11.16.0 on darwin arm64 measured 12,033,513 packed bytes and
// 23,537,986 unpacked bytes; archive SHA-256
// 8f5529910f4f4aa07e594681ab8293dd5a20797add6c32e47e6ff5f116e61cd7. Carry the
// same projections and allowances: 12,033,513 + 12,387 + 4,096 = 12,049,996
// packed; 23,537,986 + 353 + 65 = 23,538,404 unpacked. Current source CI and
// canonical Release must independently measure and admit their exact
// archives.
//
// The Threads public views counter over Ghostget 0.18.28 adds the
// target-bound `text_post_app_public_views` carrier extraction to
// meta-web.ts, its unit and runtime coverage, the threads-web 1.9.0
// adapter manifest, and the retained 1.8.0 predecessor snapshot: one
// additional packed source file. A clean npm 11.19.0 pack
// --ignore-scripts on darwin arm64 measured 11,974,295 compressed bytes,
// 23,294,815 payload bytes and exactly 592 files/entries. Archive SHA-256
// 0725e564d463965ca9b6ca8fdfb80eb712c7f4573c9a73acf499a398882cf49f. Carry
// the same projections and allowances: 11,974,295 + 12,387 + 4,096 =
// 11,990,778 packed; 23,294,815 + 353 + 65 = 23,295,233 unpacked. Current
// source CI and canonical Release must independently measure and admit
// their exact archives.
//
// Usage-driven contract repair over Ghostget 0.18.25 adds the bounded
// repair-signal inbox (src/contract-repair-inbox.ts) and the repair-handoff
// assessment (src/contracts-repair.ts) alongside the runtime, CLI, schema and
// vocabulary edits and the regenerated dist bundles: two additional packed
// source files. A clean npm 11.19.0 pack --ignore-scripts on darwin arm64
// measured 11,959,007 compressed bytes, 23,268,400 payload bytes and exactly
// 591 files/entries. Archive SHA-256
// c347ae9a739bd49660b7daea38fc799a08389616bad7b99801b00eb6e9ace7d1. The
// largest observed darwin-to-Linux packed delta for this inventory shape was
// +12,387 bytes; carry that projection plus the 4,096-byte portability
// allowance: 11,959,007 + 12,387 + 4,096 = 11,975,490. Carry the
// conservative +353-byte payload projection plus the reviewed 65-byte
// allowance: 23,268,400 + 353 + 65 = 23,268,818. Current source CI and
// canonical Release must independently measure and admit their exact
// archives.
//
// Renewable X vault imports over Ghostget 0.18.24 add the public-client
// refresh module (src/oauth-x.ts), expiry and renewal metadata on the
// account surfaces, and the desktop-wide 1Password platform gate on top of
// the contracts surface: one additional packed source file. A clean npm
// 11.19.0 pack --ignore-scripts on darwin arm64 measured 11,946,327
// compressed bytes, 23,213,056 payload bytes and exactly 589 files/entries.
// Archive SHA-256
// f67a9230983bf87b02352ed91e8dc368ff214e19fd4aecaf4a0b3476fdb3b164. The
// 0.18.24 release measured a +11,158-byte darwin-to-Linux packed delta for
// the same inventory shape; carry that projection plus the 4,096-byte
// portability allowance: 11,946,327 + 11,158 + 4,096 = 11,961,581. Carry
// the conservative +353-byte payload projection plus the reviewed 65-byte
// allowance: 23,213,056 + 353 + 65 = 23,213,474. Current source CI and
// canonical Release must independently measure and admit their exact
// archives.
//
// Renewable X vault imports over Ghostget 0.18.23 add the public-client
// refresh module (src/oauth-x.ts), expiry and renewal metadata on the
// account surfaces, and the desktop-wide 1Password platform gate. A clean
// npm 11.19.0 pack --ignore-scripts on darwin arm64 measured 11,910,740
// compressed bytes, 23,060,195 payload bytes and exactly 578 files/entries.
// Archive SHA-256
// c58f27d5b9f06040d27ca361e7816a0cde2d69c3fb26ed76649fd3f160f348f9. The
// prior darwin-to-Linux packed delta for this inventory was +12,387 bytes;
// carry that projection plus the 4,096-byte packed portability allowance:
// 11,910,740 + 12,387 + 4,096 = 11,927,223. The prior darwin-to-Linux
// payload delta was +353 bytes; carry the same projection plus the reviewed
// 65-byte allowance: 23,060,195 + 353 + 65 = 23,060,613. Current source CI
// and canonical Release must independently measure and admit their exact
// archives.
//
// Renewable X vault imports add the public-client refresh module
// (src/oauth-x.ts), expiry and renewal metadata on the account surfaces, and
// the desktop-wide 1Password platform gate. A clean npm 11.19.0 pack
// --ignore-scripts on darwin arm64 measured 11,910,002 compressed bytes,
// 23,057,885 payload bytes and exactly 578 files/entries; the Linux CI pack
// measured 11,922,389 compressed bytes for the same inventory. Archive SHA-256
// 794cbe482b03bffac194def947d3f3fcc246015fec2589e017564d3a08b3a9b0.
// Preserve the 4,096-byte packed portability allowance and the reviewed
// 65-byte payload allowance: 11,922,389 + 4,096 = 11,926,485 and
// 23,057,885 + 65 = 23,057,950. Current source CI and canonical
// Release must independently measure and admit their exact archives.
//
// Ghostget 0.18.24 adds the machine-checkable contracts surface on top of the
// 0.18.23 browser-admission recovery released from main: nine new packed
// source files (src/contracts.ts, src/contracts-catalog.ts,
// src/contracts-check.ts, src/contracts-cli.ts, src/contracts-invoke-read.ts,
// src/contracts-plan.ts, src/contracts-schema.ts, src/contracts-shape.ts,
// src/contracts-vocabulary.ts) plus the ninth inert SDK entrypoint
// dist/contracts.js and its rebuilt shared chunks. Both platforms were
// measured with a clean npm pack --ignore-scripts over the same tree:
// darwin arm64 produced 11,942,741 compressed bytes and Linux CI produced
// 11,953,899, an +11,158-byte compression delta that exceeds the historical
// 4,096-byte allowance on its own. Both measured exactly 23,193,728 payload
// bytes and 588 files/entries, so this release carries no darwin-to-Linux
// payload projection: the larger compressed measurement takes the 4,096-byte
// portability allowance (11,953,899 + 4,096 = 11,957,995) and the exact
// shared payload takes the reviewed 65-byte allowance
// (23,193,728 + 65 = 23,193,793). The darwin archive SHA-256 is
// 47684b3e2eb5cf3ed07fbb520aade8c7251d993f75262fbf1af627d9081a1a5f; a
// compressed archive is platform-specific, so source CI and the canonical
// Release still measure and admit their own exact archives.
// Ghostget 0.18.23 admits cross-boot cleanup-unsafe browser admissions whose
// published roots are already absent into the existing absent-root recovery
// proof and accepts the not_configured lifecycle save/restore vocabulary
// agent-browser 0.32.3 reports for sessions that never configured those
// features. A clean npm 11.16.0 pack --ignore-scripts on darwin arm64
// measured 11,919,738 compressed bytes, 23,040,867 payload bytes and exactly
// 577 files/entries. Archive SHA-256
// feefdaa288454938b6e6598b0cd19be5bcecbb2cca307bebafee6a32495c47e8.
// Preserve the 4,096-byte packed portability allowance: 11,919,738 + 4,096 =
// 11,923,834. The prior darwin-to-Linux payload delta was +353 bytes; carry
// the same projection plus the reviewed 65-byte allowance:
// 23,040,867 + 353 + 65 = 23,041,285. Current source CI and canonical Release
// must independently measure and admit their exact archives.
//
// Control snapshot revision batching adds a chunked fallback for incarnation
// collections larger than one helper batch. A clean npm 11.19.0 pack
// --ignore-scripts on darwin arm64 measured 11,906,030 compressed bytes,
// 23,038,557 payload bytes and exactly 577 files/entries. Archive SHA-256
// d00d126b6fc2e3d214287e1a642c5eb712062f332e4f81217f7a815fef44cd49.
// Preserve the packed ceiling and restore the reviewed 65-byte payload
// allowance: 23,038,557 + 65 = 23,038,622. Current source CI and canonical
// Release must independently measure and admit their exact archives.
//
// Control snapshot revision batching and TUI refresh work add the batched
// incarnation read and its colocated test, and grow the TUI and admission
// sources. A clean npm 11.19.0 pack --ignore-scripts on darwin arm64 measured
// 11,905,953 compressed bytes, 23,037,873 payload bytes and exactly 577
// files/entries; the Linux CI pack measured the same 23,037,873 payload bytes.
// Archive SHA-256 f9f3ab38a682690ceaa2699a7309997512030f0fa500a9dc29dcd108123dc41f.
// Preserve the packed ceiling and restore the reviewed 65-byte payload
// allowance: 23,037,873 + 65 = 23,037,938. Current source CI and canonical
// Release must independently measure and admit their exact archives.
//
// Ghostget 0.18.22 converges settling post-close browser cleanup proofs,
// admits exact absent-root admission recovery, and follows the aichartsio X
// rename. A clean npm 11.16.0 pack --ignore-scripts on darwin arm64 measured
// 11,916,797 compressed bytes, 23,029,751 payload bytes and exactly 577
// files/entries. Archive SHA-256
// 701376d7856ad330a34338e07eb3af7f3039e4e033b7ed10d27e3dd769f8729b.
// Preserve the 4,096-byte packed portability allowance: 11,916,797 + 4,096 =
// 11,920,893. The prior darwin-to-Linux payload delta was +353 bytes; carry
// the same projection plus the reviewed 65-byte allowance:
// 23,029,751 + 353 + 65 = 23,030,169. Current source CI and canonical Release
// must independently measure and admit their exact archives.

// Ghostget 0.18.21 native exact-service guard candidate adds one reviewed
// package source patch and its provenance metadata. A clean npm 11.16.0 pack
// --ignore-scripts on darwin arm64 measured 11,915,051 compressed bytes,
// 23,019,336 payload bytes and exactly 577 files/entries; the Linux CI pack
// measured 23,019,689 payload bytes for the same inventory. Archive SHA-256
// b425b3c568bddf328b667867c53e8f0a3aba02cfa7727fadd3d77cf6e9dc6f0f.
// Preserve the 4,096-byte packed portability allowance and the reviewed
// 65-byte payload allowance: 11,915,051 + 4,096 = 11,919,147 and
// 23,019,689 + 65 = 23,019,754. Current source CI and canonical Release must
// independently measure and admit their exact archives.

// Ghostget 0.18.21 local coordinate repair follows the observed closed
// native-projection/coordinate-invalid failure. Whole native parsing remains
// strict; discovery omits only unsupported GUID prefix/owner-byte-bound rows.
// npm 11.16.0 measures 11,729,759 compressed / 22,815,337 payload bytes in the
// same 576-file inventory. All source bytes match: provider +514, changelog
// +288, owner protocol docs +629 = +1,431; every other archive file is unchanged.
// SHA-256 dc4e1816acc67c990554a71c9e59e00ebed2eee5f13dedb1d583073d934e2e3a.
// Preserve compressed/file ceilings and 22,815,337 + 65 = 22,815,402 payload.
// Local diagnostic verification is separate from required source/release gates.
//
// Ghostget 0.18.21 development discovery diagnostics add one closed metadata
// module and preserve the existing native/host failure behavior. The reviewed
// local npm 11.16.0 / Node 24.18.1 darwin arm64 archive measures 11,729,305
// compressed bytes, 22,813,906 payload bytes and exactly 576 files. The entire
// inventory equals source: new module +2,370, runtime +1,536, provider +1,289,
// host +645, server +179, package allowlist +47, changelog +315, generated SDK
// chunks +5,557 = +11,938 bytes over 0.18.20. Version/import chunk renames are
// equal-size. Archive SHA-256:
// 34d071b68b74dbfb1d9332b4c1fc0f2f6d5d786578e89143cf129582539f6b71.
// Preserve the compressed ceiling and 65-byte payload allowance:
// 22,813,906 + 65 = 22,813,971. This measurement is development-only; current
// source CI and canonical release admission are still required for publication.
//
// Ghostget 0.18.20 filters only valid native discovery rows that exceed the
// owner's existing conversation metadata bounds. npm 11.16.0 / Node 24.18.1
// with zlib 1.3.1-e00f703 on darwin arm64 measured 11,726,065 compressed bytes,
// 22,801,968 payload bytes and the unchanged 575-file inventory. Every archive
// file matches source; the prior payload grows by exactly 1,097 bytes:
// imessage-automation.ts +796 and changelog +301. Version replacements and
// the renamed generated version chunk preserve their byte counts. SHA-256:
// 0d807b34de1a8f66089c650b6f90903266c4c325e188c9d168e1fd9e8709bf11.
// Keep the compressed/file ceilings and the same 65-byte payload allowance:
// 22,801,968 + 65 = 22,802,033. Current-head CI and canonical Release must
// independently admit their exact archives.
//
// Ghostget 0.18.19 resolves protected comparison roots with metadata alone.
// Linux PR CI run 35529349206, package job 106127069274, measured 22,800,871
// payload bytes. The unchanged 575-file inventory matches the prior archive:
// storage.ts +3,484, its generated SDK chunk +3,036, changelog +299 = +6,819.
// Keep the compressed and file-count ceilings; retain the 65-byte allowance:
// 22,800,871 + 65 = 22,800,936. Current-head CI and canonical Release must
// independently admit their exact archives.
//
// Ghostget 0.18.18 carries the fixed adjacent iMessage resource materialization,
// its generated SDK closure and release coordinates. npm 11.16.0 / Node 24.18.1
// with zlib 1.3.1-e00f703 on darwin arm64 measured 11,723,565 compressed bytes,
// 22,794,052 payload bytes and the unchanged 575-file inventory. Archive SHA-256:
// c482efe748f880e3717727d6d39fd92a68953e6eea766642b329ba47ae772d80.
// Keep the proven compressed ceiling and restore the 65-byte payload allowance:
// 22,794,052 + 65 = 22,794,117. Required Linux CI and Release independently
// measure and admit their exact canonical archives.
//
// Final 0.18.17 first-launch and concise-catalog repairs, with matching built
// SDK bytes, measure 572 files/entries and 22,764,262 payload bytes. npm 11.16.0
// with Node 24.18.1 / zlib 1.3.1-e00f703 on darwin arm64 packed 11,714,977
// compressed bytes; every archive entry matched current source bytes.
// Archive SHA-256: a211e0a1fc8cca37ce468a22500c1718787baca2c304b537a1a636ac3d98560e.
// Keep the reviewed compressed ceiling and exact inventory; retain the same
// payload allowance: 22,764,262 + 65 = 22,764,327. Canonical Linux CI and
// Release independently measure and admit their exact archives.
//
// Integrating main 639825a preserves the Jev reference retirement below:
// 22,771,636 - 12,213 = 22,759,423 across exactly 572 files. Restore the
// same payload allowance: 22,759,423 + 65 = 22,759,488.
//
// Ghostget 0.18.17 onboarding and local-control release candidate adds seven
// packed production files: helper-client.ts, control-response.ts, vault-input.ts,
// vault-cli.ts, tui.ts, tui-model.ts, and tui-terminal.ts under src/control.
// The CLI, menu, credential validation, docs, and generated version chunk also
// change. `npm pack --ignore-scripts --json --pack-destination <private-dir>
// --registry=https://registry.npmjs.org` with Node 24.18.1, npm 11.16.0,
// zlib 1.3.1-e00f703 on darwin arm64 measured exactly 573 files/entries,
// 11,717,815 compressed bytes and 22,769,813 payload bytes. Every packed
// file's bytes matched the converged source. Archive SHA-256:
// cca7868892b6c57901c581f10e714292086d7b38a1b4b261df7216dacd8367f0.
// Retain the reviewed 65-byte payload allowance:
// 22,769,813 + 65 = 22,769,878. For local compression, retain the documented
// 148,155-byte platform/compressor spread from the 9af4d34 measurements below
// and the existing 4,096-byte portability allowance:
// 11,717,815 + 148,155 + 4,096 = 11,870,066. This is local evidence, not a
// claim of identical canonical gzip bytes. Required Linux CI and Release
// independently admit their actual Node 24.20.0/npm 11.19.0 archives.
// The final helper framing and menu lifecycle repairs add exactly 641 and
// 1,182 source payload bytes. Rechecking every path in the measured inventory
// gives 22,771,636 bytes across the same 573 files. Keep the compressed ceiling
// and restore the 65-byte payload allowance: 22,771,636 + 65 = 22,771,701.
//
// Jev example retirement removes one packed reference and 12,213 payload bytes
// from the reviewed PR #301 tree: 22,689,627 - 12,213 = 22,677,414.
// Restore the exact 565-file inventory and the same 65-byte payload allowance:
// 22,677,414 + 65 = 22,677,479. Retain the proven Linux compressed ceiling;
// required package CI independently checks the resulting canonical archive.
// Earlier measurement receipts below remain historical evidence.
//
// PR #301 Linux CI run 35449445752 attempt 1, package job 105913938839,
// packed reviewed tree 355a85fac97013265c44b480921591d9d0323614 with npm
// 11.19.0: 11,696,091 compressed / 22,689,627 payload bytes and 566 files
// (archive SHA-1 04a2ec29cf69d5edf31c37b5fb9a1c51db431585). The Linux
// compressed archive exceeds the older platform ceiling; retain its existing
// 4,096-byte margin: 11,696,091 + 4,096 = 11,700,187.
// Static job 105913938951 also measured the existing private-field fixture
// at 22,689,648 bytes. Restore the original 65-byte payload allowance over
// the final documentation, rather than consuming it with the last edit:
// 22,689,627 + 65 = 22,689,692. Keep the exact 566-file/entry inventory.
//
// The initial consumer candidate-decisions reference added one packed file and
// 12,158 payload bytes over main b518370: candidate-decisions.md +11,628,
// SKILL.md +277, and references/messaging.md +253. A Bun 1.3.14 pack
// --ignore-scripts on darwin arm64 measured 11,547,963 compressed /
// 22,689,572 payload bytes across exactly 566 files, archive SHA-256
// aab8003f241c2d63aec2bf909d587e11c983fabb689d43386202db22a2b471a5.
// Retain the packed ceiling, add the reference to the file/entry inventory,
// and retain the reviewed 65-byte payload allowance:
// 22,689,572 + 65 = 22,689,637. The final fixed-model wire-budget correction
// adds 55 documentation bytes; the unchanged ceiling retains ten bytes:
// 22,689,627 + 10 = 22,689,637.
//
// Hraness Accounts CLI login integration adds exactly one packed file and
// 1,356 payload bytes: src/accounts-auth.ts and its package.json files entry.
// A Bun 1.3.14 pack on darwin arm64 measured 22,657,938 payload bytes across
// exactly 564 files. Keep the packed ceiling; raise the file/entry inventory
// to 564 and the payload ceiling by the measured delta while preserving the
// reviewed 65-byte allowance: 22,657,938 + 65 = 22,658,003.
//
// Ghostget 0.18.15 release preparation over the X evidence refresh adds
// exactly 12 payload bytes and no files: the version coordinate bumps and the
// 0.18.15 changelog heading. npm 11.16.0 under darwin arm64 measured this
// candidate at 11,685,812 compressed / 22,656,407 payload bytes across
// exactly 563 files; archive SHA-1 48fd15078406b0e314410f70db4a4a33a3ab6241.
// Keep the packed ceiling and the exact inventory; raise the payload ceiling
// by the measured delta while preserving the reviewed 65-byte allowance:
// 22,656,407 + 65 = 22,656,472. Required Linux CI and the canonical Release
// independently admit their actual archives.
//
// The 2026-09-17 X descriptor evidence refresh over the 0.18.14 release
// preparation adds exactly 918 payload bytes and no files: current
// authenticated client-web query IDs, longer shared-chunk filenames, the
// retired DM search descriptors, the profile-read guard for X's empty-data
// deleted-account shape, and its changelog note. npm 11.16.0 under darwin
// arm64 measured this candidate at 11,685,806 compressed / 22,656,395
// payload bytes across exactly 563 files; archive SHA-1
// 350518b514afe8281e1a33e8a4cc1784e674b538. Keep the packed ceiling and the
// exact inventory; raise the payload ceiling by the measured delta while
// preserving the reviewed 65-byte allowance: 22,656,395 + 65 = 22,656,460.
// Required Linux CI and the canonical Release independently admit their
// actual archives.
//
// Ghostget 0.18.14 release preparation over main 5a58396 adds exactly 1,139
// payload bytes and no files: the version coordinate bumps package.json,
// src/version.ts, the declared producer literal in src/beeper-client-types.ts
// and README, publishing, skill install, and local-CLI provider prose; the
// changelog gains the Beeper automation release note; and the generated
// version chunk renames.
// A Bun 1.3.14 pack on darwin arm64 measured 11,536,607 compressed /
// 22,655,477 payload bytes across exactly 563 files, SHA-256
// 6a09a4699b387e0d0a204379c7a3a2f10a79510778f1605851215d424af28404.
// Raise the packed ceiling by the documented darwin/Linux zlib spread
// (148,155 bytes at 9af4d34) plus the reviewed 4,096-byte portability
// allowance: 11,536,607 + 148,155 + 4,096 = 11,688,858. Retain the
// reviewed 65-byte payload allowance: 22,655,477 + 65 = 22,655,542.
// Canonical Node/npm Linux CI and Release independently admit their actual
// archive; this is local evidence.
//
// Shared-footer v0.13.0 repin over main c4c1469 adds exactly 369 payload
// bytes, all in CHANGELOG.md: the six-line Unreleased note for the shared
// "Built by Hraness" attribution. The `github:hraness/site-footer#v0.13.0`
// pin keeps its byte length, and the footer remains a development-only
// dependency outside the public archive. npm 10.9.7 under Node 22.14.0 on
// Linux x64 measured main at 11,673,185 compressed / 22,571,708 payload bytes
// and this candidate at 11,673,325 compressed / 22,572,077 payload bytes,
// both across exactly 561 files; candidate archive SHA-1
// 41de26ca839fb0ba8ab93ba03b4f91140ebe6925. Keep the packed ceiling and the
// exact inventory; raise the payload ceiling by the measured delta while
// preserving the reviewed 65-byte allowance: 22,572,077 + 65 = 22,572,142.
// Required Linux CI and the canonical Release independently admit their
// actual archives.
//
// Ghost emoji status mark over the merged support candidate adds exactly one
// packed file and 5,841 payload bytes: src/control/menubar-icon.ts +5,810
// (the pre-rendered Twemoji CC-BY 4.0 ghost the icon-only Windows/Linux tray
// surfaces use while macOS renders the native emoji title) and package.json
// +31 (the packed file entry). The pinned v0.7.0 foundation release tarball
// coordinate keeps its byte length. An npm pack on darwin arm64 measured
// 11,663,260 compressed / 22,571,609 payload bytes across exactly 561 files;
// archive SHA-256:
// 160726e2db7ac18e243c2ce3b04bf967e49233730eb66b5a7bc102827ece05dc.
// The Required Linux CI package job measured the same archive at 11,673,155
// compressed bytes, which becomes the canonical packed measurement:
// 11,673,155 + 4,096 = 11,677,251. Keep the reviewed 65-byte payload
// allowance: 22,571,609 + 65 = 22,571,674. Required Linux CI and the
// canonical Release independently admit their actual archives.
//
// Final Ghostget 0.18.13 also retains direct iMessage RPC group escalation
// after a leader exits and closes its pipes. Against the support candidate
// below, the runtime adds 1,131 bytes and its changelog adds 154. Two identical
// npm 11.19.0 / Node 24.18.1 archives measure 11,670,047 compressed bytes,
// 22,565,768 payload bytes and exactly 560 files; every byte and executable
// mode matches source. SHA-256:
// 08ab419759025a338cce9bdddf7e3b48f661a6d076396f4fb18c822c08119860.
// Generated SDK files remain unchanged. Keep the compressed ceiling and exact
// inventory; add only the measured 1,285 payload bytes, preserving 65 bytes
// of allowance: 22,565,768 + 65 = 22,565,833. The derived tar bound remains
// formula-based, and required CI/release verify their actual archives.
//
// Earlier Ghostget 0.18.13 menu and website support over main 9af4d34 adds exactly
// one packed file and 1,974 payload bytes: shared public profile +279,
// CLI profile extraction -97, explicit menu actions +1,035, package inventory
// +30, README +224 and changelog +503. Version coordinates and the replaced
// 90-byte generated version chunk retain their lengths. The website and its
// development-only footer dependency remain outside the public archive.
// npm 11.19.0 under Node 24.18.1 on darwin arm64 measured 11,669,486
// compressed / 22,564,483 payload bytes across exactly 560 files; every
// packed file matched its source bytes. Archive SHA-256:
// 6a266944e0815c607d2722e592ed8875fee718e4f9fd5f23d7492c81af722712.
// Keep the existing packed ceiling and the reviewed 65-byte payload allowance:
// 22,562,509 + 1,974 + 65 = 22,564,548. Required Linux CI and the canonical
// Release independently admit their actual archive and installation.
//
// Beeper owner-messaging automation over main f239de1 adds exactly two
// packed files and 82,261 payload bytes:
// src/assets/adapters/beeper/wrench-web-adapter.v2.4.0.json +44,811 (the
// archived pre-automation adapter baseline) and
// src/providers/beeper-automation.ts +29,199 (the host-only automation
// provider), plus the current adapter manifest's two new
// messaging.automation.* operation descriptors and rebuilt dist chunks.
// The dist entry set is unchanged: six renamed content-hash chunks replace
// six predecessors. A Bun 1.3.14 pack on darwin arm64 measured 11,536,183
// compressed / 22,654,338 payload bytes across exactly 563 files, SHA-256
// a20110e0fbb5fc3cdf36d7fe8551a46a415e37d76ca6e738e4171f2f4a420355.
// Raise the packed ceiling by the documented darwin/Linux zlib spread
// (148,155 bytes at 9af4d34) plus the reviewed 4,096-byte portability
// allowance: 11,536,183 + 148,155 + 4,096 = 11,688,434. Retain the
// reviewed 65-byte payload allowance: 22,654,338 + 65 = 22,654,403.
// Canonical Node/npm Linux CI and Release independently admit their actual
// archive; this is local evidence.
//
// Shared-foundation menu-bar migration over main dd1f377 adds exactly one
// packed file and 33,838 payload bytes: src/control/menubar-cli.ts +33,710
// (the TypeScript adapter ships so `ghostget menubar` drives the shared
// desktop-foundation runner over the helper's private stdio channel) and
// package.json +128 (the pinned v0.6.0 foundation release tarball). The
// standalone Swift companion, its build scripts, Package.swift and the
// Ghostget-owned LaunchAgent lifecycle leave the release. A Bun 1.3.14
// pack on darwin arm64 measured 11,520,572 compressed / 22,562,509
// payload bytes across exactly 559 files, SHA-256
// 6b46852893ff1714bf7c2d6a7027e5e8a9d6fc614b838675bef0ca2092c015d5; the
// Required Linux CI package job on PR #272 measured the same archive at
// 11,668,727 compressed bytes under the Linux toolchain, consistent with
// the documented darwin/Linux zlib spread. Raise the packed ceiling to the
// reviewed 4,096-byte portability allowance above that larger measurement:
// 11,668,727 + 4,096 = 11,672,823. Retain the reviewed 65-byte payload
// allowance: 22,562,509 + 65 = 22,562,574. Canonical Release still admits
// its actual archive.
//
// Ghostget 0.18.12 agent support discovery over main e9513c7 adds exactly
// 8,123 payload bytes: source modules +4,519, six generated SDK entrypoints
// +425, and README/SKILL/changelog +3,179. The canonical Textbutler full-commit
// coordinate adds 29 manifest bytes and its release note adds 160 bytes; the
// reviewed dependency source and runtime contract hashes remain unchanged.
// Version coordinates and the renamed version chunk retain their byte lengths.
// Bun 1.3.14 on darwin arm64 measured 11,512,047 compressed / 22,528,671
// payload bytes across exactly 558 files, SHA-256
// 2d8231979058f85264856d8cc6e3c0b8ac94a22e6f572f513f9b553b707040eb.
// Retain the packed ceiling and the reviewed 65-byte payload allowance:
// 22,520,359 + 8,123 + 189 + 65 = 22,528,736. Canonical Node/npm Linux CI and
// Release independently admit their actual archive; this is local evidence.
//
// Ghostget 0.18.11 shared-footer v0.11.2 repin over main c931249 adds exactly
// 202 payload bytes over the 0.18.10 measurement: the site-footer pin and the
// release changelog/coordinate edits retain their byte lengths. A Bun 1.3.14
// pack on darwin arm64 measured 11,508,687 compressed / 22,520,359 payload
// bytes across the same 558 files, SHA-256
// 1294d4d7b01869352af72abb4e7510e6d99d51896a8751a5446152b2fe1f6ef3.
// Retain the packed-byte ceiling and the reviewed 65-byte payload allowance:
// 22,520,359 + 65 = 22,520,424.
// Canonical Node/npm Linux CI still independently admits its own archive.
//
// Ghostget 0.18.10 cleanup-convergence candidate over main 0840d3a preserves
// the 558-file public boundary and the existing packed-byte ceiling. A Bun
// 1.3.14 canonical pack on darwin arm64 measured 11,508,605 compressed /
// 22,520,157 payload bytes. Keep the reviewed 65-byte payload allowance:
// 22,520,157 + 65 = 22,520,222. Required CI and Release remeasure it.
//
// Ghostget 0.18.9 shared-footer v0.11.1 repin over main 9d23a99 adds exactly
// 172 payload bytes over the 0.18.8 measurement: the site-footer pin and the
// release changelog/coordinate edits retain their byte lengths. A Bun 1.3.14
// pack on darwin arm64 measured 11,508,293 compressed / 22,519,442 payload
// bytes across the same 558 files, SHA-256
// 8c7f28f09482732a29bb8acac486f0dfb004698bb3823531a7c9a2e445417404.
// Retain the packed-byte ceiling and the reviewed 65-byte payload allowance:
// 22,519,442 + 65 = 22,519,507.
// Canonical Node/npm Linux CI still independently admits its own archive.
//
// Ghostget 0.18.8 Git-email suggestions over main 734a921 add exactly 1,548
// payload bytes: skills/ghostget/SKILL.md +1,231 and CHANGELOG.md +317.
// The full-commit dependency pin, version coordinates, and generated version
// chunk/import names preserve their byte lengths. A Bun 1.3.14 pack on darwin
// arm64 measured 11,508,184 compressed / 22,519,205 payload bytes in 558 files,
// SHA-256 7b4d626d9a0fe4189eac39a4853639dcb01cf7e7ef053390c7d0ebedc1ebfa20.
// Retain the packed-byte ceiling and reviewed 65-byte payload allowance:
// 22,517,657 + 1,548 + 65 = 22,519,270. Canonical Node/npm Linux CI still
// independently admits its own archive; this Bun measurement does not replace it.
//
// Ghostget 0.18.7 optional support invitations joined with main 811f3b3 add
// one published source module and exactly 4,207 payload bytes: package.json
// +135 (including the full-commit dependency pin), src/cli.ts +1,647,
// src/usage.ts +468, skills/ghostget/SKILL.md +781, src/support.ts +857,
// and the versioned changelog +319. Version literals, the generated version
// chunk and its imports keep their byte lengths; native assets are unchanged.
// Retain the reviewed 65-byte payload allowance and packed-byte ceiling:
// 22,513,450 + 4,207 + 65 = 22,517,722, with exactly 558 files.
// The joined setup-cleanup base below reduced measured payload by 9,987 bytes.
// Required Linux CI independently admits its rebuilt canonical archive.
//
// Ghostget 0.18.6 same-boot setup-cleanup candidate over main edbe567.
// A canonical npm 11.19.0 pack with --ignore-scripts under Node 24.20.0
// on darwin arm64 / zlib 1.3.2.1-motley-42c2f19 measured 11,656,173
// compressed / 22,513,450 payload bytes across exactly 557 files. Its
// SHA-256 is 14ca5affd08c7d3561401b7e38c048e1bb0d6a02b02312210ea4c3d314d5d82c.
// The setup-cleanup source, generated bundle, version coordinates, and release
// note remain below the existing reviewed packed and payload ceilings; the
// package inventory and website boundary are unchanged. Fresh Required Linux
// CI and Release must still admit their actual canonical bytes.
//
// Ghostget 0.18.5 release candidate over main 202117c. A canonical npm
// 11.19.0 pack with --ignore-scripts under Node 24.20.0 darwin-arm64
// measured 11,649,401 compressed / 22,523,437 payload bytes across
// exactly 559 files. The 0.18.5 changelog section, release coordinates,
// and install-command references account for the 455 payload bytes above
// the menu-bar measurement; version literals retain their length and the
// packed-file inventory and website/package boundary are unchanged.
// Keep the reviewed 65-byte payload allowance: 22,523,437 + 65 = 22,523,502.
// The compressed measurement stays under the existing
// 4,096-byte compressor allowance. Fresh Required Linux CI and Release
// still admit their actual canonical bytes.
//
// Menu-bar companion candidate: the shared-foundation port adds the
// `ghostget menubar` launcher, which bundles into the existing CLI entry
// chunks. Required Linux CI run 34794821049 measured 22,522,826 unpacked
// bytes and the clean macOS pack measured 22,522,982, both across exactly
// 557 files with the packed ceiling unchanged. Retain the reviewed 65-byte
// payload allowance above the larger measurement:
// 22,522,982 + 65 = 22,523,047.
//
// Ghostget 0.18.4 interactive root-help refinement over main 9cb3cbe.
// Two canonical npm 11.19.0 packs with --ignore-scripts under official
// Node 24.20.0 darwin-arm64 / zlib 1.3.2.1-motley-42c2f19 are byte-identical:
// SHA-256 c124bf65b11b124d293ca95680aefef3d8a9e74f36159f8df0e435eb9a149073,
// 11,658,847 compressed / 22,522,543 payload bytes across exactly 557 files.
// Every packed file matches its source bytes. The new 434-byte CLI intro,
// its 199-byte call site, 9-byte help label, 25-byte explicit manifest entry,
// and 337-byte changelog add exactly 1,004 payload bytes over 0.18.3.
// The 89-byte version chunk is renamed by the SDK build; it and its import
// references retain their lengths. Native assets and the package/site boundary
// are unchanged. Keep the measured compressor allowance and payload headroom:
// 11,658,847 + 4,096 = 11,662,943; 22,522,543 + 65 = 22,522,608.
// Fresh Required Linux CI and Release still admit their actual canonical bytes.
//
// Ghostget 0.18.3 Lantern release candidate ece1a6a. Required Linux CI
// 34708922100, static job 103593972035 and package job 103593972046,
// independently measured 22,521,539 unpacked bytes: exactly 250 bytes
// above main af759ce2, all from the versioned Lantern changelog entry.
// Version coordinates keep their length; the 558-file inventory, native
// assets, packed-byte ceiling and website/package boundary are unchanged.
// Retain the reviewed 65-byte payload allowance: 22,521,539 + 65 = 22,521,604.
// Fresh Required CI and Release must still inspect their canonical bytes.
//
// Ghostget 0.18.2 source plus the LinkedIn `contacts.read` click when
// NavigateToScreen extract is absent (adapter bundle 1.36.3), measured
// from the 1.36.2 Linux x64 payload plus the exact packed-file delta:
// CHANGELOG, adapter notes, and the reviewed overlay-click builder add
// 3,542 payload bytes. 22,517,747 + 3,542 = 22,521,289 across exactly
// 558 files. Raise only the payload ceiling to that measured value
// plus 65 bytes of headroom (22,521,354); the packed size stays under
// the existing packed allowance and the 558-entry inventory is
// unchanged. Theme CSS stays website-only. Fresh Linux CI
// independently checks its actual canonical archive.
//
// Ghostget 0.18.2 source plus the LinkedIn `contacts.read` post-click
// bind on the reviewed vanity overlay pathname (adapter bundle
// 1.36.2), measured with no version bump: a Bun 1.3.14 `pm pack` on
// Linux x64
// shares 22,517,747 payload bytes across exactly 558 files. The bun
// archive is 11,508,884 compressed bytes, SHA-256
// b74ba576b58bb5b8b2b9de1bdb4ab27280b99fa156d2eb1e6c768954b4d50b23.
// Allowing that exact `/in/{vanity}/overlay/contact-info/` pathname
// after the unique Contact info click, adapter notes, changelog, and
// tests add 2,280 payload bytes compared with the 0.18.2 / 1.36.1
// measurement. Raise only the payload ceiling to the measured value
// plus 65 bytes of headroom (22,517,812); the packed size stays under
// the existing packed allowance and the 558-entry inventory is
// unchanged. Theme CSS stays website-only. Fresh Linux CI
// independently checks its actual canonical archive.
//
// Ghostget 0.18.2 marketing and archive recovery joined with main e46e9a0
// (LinkedIn adapter 1.36.1). Two clean Bun 1.3.14 builds and canonical npm
// 11.19.0 packs under official Node 24.20.0 darwin-arm64 with zlib
// 1.3.2.1-motley-42c2f19 produce identical archives: SHA-256
// 1f936230bbfe3624e8a633b3068d99d3839d5ba092fcb104b6c172984a4cb363,
// 11,657,577 compressed / 22,515,467 payload bytes across the same 558 files.
// Compared with that main source, the task changelog adds 315 payload bytes;
// release-version coordinates retain their length. Theme assets stay website-only.
// Preserve the existing 4,096 compressed-byte and 65 payload-byte allowances:
// 11,657,577 + 4,096 = 11,661,673; 22,515,467 + 65 = 22,515,532.
// Fresh Required Linux CI and Release must inspect their actual canonical bytes.
//
// Ghostget 0.18.2 marketing and canonical archive recovery joined with main
// a02519a (LinkedIn adapter 1.34.0). Two clean Bun 1.3.14 builds and canonical
// npm 11.19.0 packs under official Node 24.20.0 darwin-arm64 with zlib
// 1.3.2.1-motley-42c2f19 produce identical archives: SHA-256
// 376dee6d63a54be49b46407cbcb69769da00c075657d89f40e0002975d49225f,
// 11,654,474 compressed / 22,497,313 payload bytes across the same 558 files.
// The task changelog adds 315 payload bytes; version coordinates retain their
// length. Native bytes, exports and the website/package boundary are unchanged.
// Retain exactly 4,096 compressed-byte and 65 payload-byte allowances:
// 11,654,474 + 4,096 = 11,658,570; 22,497,313 + 65 = 22,497,378.
// Fresh Required Linux CI and Release must admit their actual canonical bytes.
//
// Ghostget 0.18.2 shared marketing release on main d58db40. Two clean Bun
// 1.3.14 builds and canonical npm 11.19.0 packs under official Node 24.20.0
// darwin-arm64 / zlib 1.3.2.1-motley-42c2f19 produce identical archives:
// SHA-256 7a1459e68864f3b5c5779915f37aba6bc0d164b57ddd69a86e581674c30fed06,
// 11,649,815 compressed / 22,479,283 payload bytes across the same 558 files.
// Release coordinates retain their length; the task changelog adds 244 payload
// bytes. The website, shared font and textures stay outside the package.
// Preserve 4,096 compressed-byte and 65 payload-byte allowances, the exact
// inventory and native artifact bytes. Required Linux CI admits its own archive.
//
// Ghostget 0.18.1 source plus the LinkedIn `contacts.read` unique
// Contact info click when that control's href matches
// `/overlay/contact-info/` (adapter bundle 1.36.1), measured with no
// version bump: a Bun 1.3.14 `pm pack` on Linux x64
// shares 22,515,152 payload bytes across exactly 558 files. The bun
// archive is 11,508,333 compressed bytes, SHA-256
// c606e02ae0ce9b4c72f8b27f7b705698597e6f1f474d0dc00f525cd7c0bbc259.
// Allowing that unique overlay-href click, wrapped eval
// classification, adapter notes, changelog, and tests add 1,388
// payload bytes compared with the 1.36.0 measurement. Raise only the
// payload ceiling to the measured value plus 65 bytes of headroom
// (22,515,217); the packed size stays under the existing packed
// allowance and the 558-entry inventory is unchanged. Theme CSS stays
// website-only. Fresh Linux CI independently checks its actual
// canonical archive.
//
// Ghostget 0.18.1 source plus the LinkedIn `contacts.read` reviewed
// Contact info click and modal snapshot (adapter bundle 1.36.0),
// measured with no version bump: a Bun 1.3.14 `pm pack` on Linux x64
// shares 22,513,764 payload bytes across exactly 558 files. The bun
// archive is 11,507,774 compressed bytes, SHA-256
// a7c6b53a90bde4324f2e4a8b3fb7af7ea2550d56549aad9c6a62c2637f035a04.
// Replacing the synthetic navigation POST with the reviewed unique
// Contact info click, adapter notes, changelog, and tests add 8,846
// payload bytes compared with the 1.35.0 measurement. Raise only the
// payload ceiling to the measured value plus 65 bytes of headroom
// (22,513,829); the packed size stays under the existing packed
// allowance and the 558-entry inventory is unchanged. Theme CSS stays
// website-only. Fresh Linux CI independently checks its actual
// canonical archive.
//
// Ghostget 0.18.1 source plus the LinkedIn `contacts.read` observed
// rsc-action tracking, pageforest, trace, and layout-tree header copies
// (adapter bundle 1.35.0), measured with no version bump: a Bun 1.3.14
// `pm pack` on Linux x64
// shares 22,504,918 payload bytes across exactly 558 files. The bun
// archive is 11,506,310 compressed bytes, SHA-256
// da3f581f1f96724337a99c4b80567d4d11893c4df1ff9a808464260796092976.
// Copying those already-observed X-Li names, adapter notes, changelog,
// and tests add 7,920 payload bytes compared with the 1.34.0
// measurement. Raise only the payload ceiling to the measured value
// plus 65 bytes of headroom (22,504,983); the packed size stays under
// the existing packed allowance and the 558-entry inventory is
// unchanged. Theme CSS stays website-only. Fresh Linux CI independently
// checks its actual canonical archive.
//
// Ghostget 0.18.1 source plus the LinkedIn `contacts.read` page-derived
// X-Li header bind (adapter bundle 1.34.0), measured with no version
// bump: a Bun 1.3.14 `pm pack` on Linux x64
// shares 22,496,998 payload bytes across exactly 558 files. The bun
// archive is 11,504,433 compressed bytes, SHA-256
// 47c0114ba631b314fa5bea489eb79e29a77bb7e06321c4088725b6b238dfe81a.
// Opening the reviewed profile document, copying unique page-derived
// X-Li headers, adapter notes, changelog, and tests add 17,959 payload
// bytes compared with the 0.18.1 / 1.33.0 measurement. Raise only the
// payload ceiling to the measured value plus 65 bytes of headroom
// (22,497,063); the packed size stays under the existing packed
// allowance and the 558-entry inventory is unchanged. Theme CSS stays
// website-only. Fresh Linux CI independently checks its actual
// canonical archive.
//
// Ghostget 0.18.1 packed-size portability after LinkedIn adapter 1.34.0:
// required Linux CI run 34675756854 / package job 103505207279 measured
// the canonical npm archive at 11,654,371 compressed bytes under the
// pinned toolchain, 549 bytes above the previous 11,653,822 ceiling.
// Payload (22,496,998 measured; 22,497,063 ceiling), 558-file inventory,
// and tar bounds are unchanged. Keep the reviewed 4,096-byte
// portability allowance above the largest measured compression:
// 11,654,371 + 4,096 = 11,658,467. This remains a compressor-spread
// allowance, not a guarantee for arbitrary compressors; required CI
// still checks the actual archive under the release toolchain.
//
// Ghostget 0.18.1 messaging automation joined with main 01a696f
// (LinkedIn adapter 1.33.0). Two clean Bun 1.3.14 builds and canonical npm
// 11.19.0 packs use the official Node 24.20.0 darwin-arm64 runtime with zlib
// 1.3.2.1-motley-42c2f19, matching the required Linux CI compressor. Archives
// are identical: 11,649,726 compressed / 22,479,039 payload bytes, 558 files,
// SHA-256 3e96590b2334be064df614a9c65908b460f07be65def73d39eb71ab91d5fe204.
// All paths and modes remain; the joined changelog, two guides, LinkedIn contact
// runtime and contract definitions account for the exact 4,734-byte payload
// increase. Native bytes and eight inert SDK entrypoints are unchanged.
// Retain exactly 4,096 compressed-byte and 65 payload-byte allowances:
// 11,649,726 + 4,096 = 11,653,822; 22,479,039 + 65 = 22,479,104.
// Fresh Required Linux CI and Release still admit their actual canonical bytes.
//
// Canonical compression correction for 0.18.1 candidate 2931dd0, source tree
// 07de7b236089f6f116a075b550cf1d7a8381731b. Required Linux CI run 34673035298
// attempt 1 / package job 103497890460 produced 11,648,247 compressed bytes
// with Node 24.20.0 / npm 11.19.0 / zlib 1.3.2.1-motley-42c2f19. Its exact
// 558-path/size/mode inventory and 22,474,305 payload bytes match both Mac packs.
// Recompressing their unchanged tar (SHA-256
// f3a019d12d62d947e963dd6b81dc583e1897f0e76261fbd3f1ef8705390ed5b5) at npm's
// level 9 / portable gzip OS byte with installed Node 24.19.0 / motley-3246f1b
// reproduces the Linux SHA-1 and SHA-512 exactly. Reproduced archive SHA-256:
// 52553bf2a994d12620df6973d2be365ca5b8ebf1c5e3266165d6b1000e7ea72f.
// Homebrew Node 24.20.0 / zlib 1.2.12 reproduces the smaller Mac archive below.
// Replace the obsolete 2,802-byte spread projection with the observed canonical
// maximum; retain exactly 4,096 compressed bytes of headroom:
// 11,648,247 + 4,096 = 11,652,343. Payload, inventory, tar, native pins and
// exports stay unchanged. Fresh Required CI must admit its actual archive.
//
// Ghostget 0.18.1 with the leaf automation SDK boundary, joined with main
// 79b74fe (LinkedIn adapter 1.32.0). Two clean Bun 1.3.14 builds and npm
// 11.19.0 packs under Node 24.20.0 / zlib 1.2.12 on darwin arm64 are identical:
// 11,638,165 compressed / 22,474,305 payload bytes across exactly 558 files,
// SHA-256 56b38a2714918029075503d4e916f797e97e9ccaa76bed894421e2b4946ac677.
// Removing the accidental public session factory removes 61 generated dist files
// (83 -> 22); all non-dist inventory paths are retained. Built-in account and
// policy factories remain available through the source CLI. Native bytes and
// all eight public SDK entrypoints remain. Preserve the existing 2,802-byte
// platform spread, 4,096 compressed-byte and 65 payload-byte allowances; reduce
// the ceilings and exact inventory to this measured package. Current Required
// Linux CI must independently admit its actual canonical archive.
//
// Ghostget 0.18.1 messaging automation joined with main ac44040, including
// the admitted imsg .3 no-fetch native cards and shipped release resources.
// Two clean Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0 on
// darwin arm64 are byte-identical: 12,561,964 compressed / 27,437,097 payload
// bytes across exactly 619 files, SHA-256
// 0914c7721df5cd1a2e317d334d7ee60e6ff8f461e4e61a21aae086cd9d5fb322.
// The third reviewed imsg patch adds one inventory entry. The smaller signed
// native artifact more than offsets the joined source, provenance and docs.
// Reduce both byte ceilings to this measurement plus the unchanged 2,802-byte
// observed platform spread, 4,096 compressed-byte and 65 payload-byte allowances.
// Keep the existing five Release assets and eight inert SDK entrypoints.
// Current Required Linux CI must independently inspect its canonical archive.
//
// Messaging automation joined with main 9cc16e1 (LinkedIn non-flight bootstrap).
// Two clean Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0 on
// darwin arm64 are byte-identical: 12,716,885 compressed / 27,573,685 payload
// bytes across exactly 618 files, SHA-256
// 060a2a4b7eacf56e7399f29be241bfe611a7837c82a0d86c981c85d67a764f2a.
// The joined source and generated provider chunk add 1,985 payload bytes over
// the messaging-only measurement below. Preserve its exact inventory and
// existing 2,802 + 4,096 compressed-byte and 65 payload-byte allowances.
// Current Linux CI must still inspect the actual canonical artifact.
//
// Ghostget messaging automation with bundled reviewed iMessage and WhatsApp
// helpers, PhoneNumberKit resources, durable host and eighth public SDK entrypoint.
// Two clean Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0 on
// darwin arm64 are byte-identical: 12,715,931 compressed / 27,571,700 payload
// bytes across exactly 618 files, SHA-256
// a552f3a4081f5478ee80c9a0bd4ad433ba1297044901d0113a5ddd26850eb161.
// The five pinned compressed helper/resource files contribute 9,402,391 payload
// bytes; their source pins, licenses, patches, host, and generated SDK chunks
// explain the remaining measured growth. No additional Release asset is added.
// Preserve the existing 2,802-byte observed platform spread plus 4,096-byte
// compression allowance, 65 payload bytes, and exact measured file inventory.
// Required Linux CI independently admits its actual canonical package; this
// local measurement does not qualify account activation or message delivery.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` exact headed
// payload.requestMetadata POST body (adapter bundle 1.33.0),
// measured with no version bump: a Bun 1.3.14 `pm pack` on Linux x64
// shares 12,725,779 payload bytes across exactly 524 files. The bun
// archive is 2,190,088 compressed bytes, SHA-256
// 43818a0f9210eea9ab07964afe98df56444c042cd911599b9cac83f93bcf1d6d.
// Completing omitted headed metadata, the 20260912 capture notes, and
// tests add 740 payload bytes compared with the first 1.33.0
// measurement. Raise only the payload ceiling to the measured value
// plus 65 bytes of headroom (12,725,844); the packed size stays under
// the existing packed allowance and the 524-entry inventory is
// unchanged. Theme CSS stays website-only. Fresh Linux CI independently
// checks its actual canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` nested
// payload.requestMetadata POST body (adapter bundle 1.33.0),
// measured with no version bump: a Bun 1.3.14 `pm pack` on Linux x64
// shares 12,725,039 payload bytes across exactly 524 files. The bun
// archive is 2,189,810 compressed bytes, SHA-256
// 82aebc3443ba76a5f5ecb20121528aec7d52b3c25f9d0546310e213588dc9aad.
// Nested headed metadata, adapter notes, changelog, and tests add 3,994
// payload bytes compared with the 1.32.0 measurement. Raise only the
// payload ceiling to the measured value plus 65 bytes of headroom
// (12,725,104); the packed size stays under the existing packed
// allowance and the 524-entry inventory is unchanged. Theme CSS stays
// website-only. Fresh Linux CI independently checks its actual
// canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` sibling
// requestMetadata / proto.sdui POST body (adapter bundle 1.32.0),
// measured with no version bump: a Bun 1.3.14 `pm pack` on Linux x64
// shares 12,721,045 payload bytes across exactly 524 files. The bun
// archive is 2,188,869 compressed bytes, SHA-256
// 6ce1e1a7bf4f3f4d30b56cce135be3916efe3602fa7f595ceffd640de432a0dc.
// Sibling requestMetadata, proto.sdui type admission, adapter notes,
// changelog, and tests add 3,975 payload bytes compared with the 1.31.0
// measurement. Raise only the payload ceiling to the measured value plus
// 65 bytes of headroom (12,721,110); the packed size stays under the
// existing packed allowance and the 524-entry inventory is unchanged.
// Theme CSS stays website-only. Fresh Linux CI independently checks its
// actual canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` navigation POST
// Email path (adapter bundle 1.31.0), measured with no version bump: a
// Bun 1.3.14 `pm pack` on Linux x64 shares
// 12,717,070 payload bytes across exactly 524 files. The bun archive is 2,188,108 compressed
// bytes, SHA-256
// 77b915c17c573d48b421253fd22a8d1e302e03e2aa637dc3e33f57c007fa8763.
// Binding sduiid to the overlay screenId, nested payload peel,
// adapter notes, changelog, and tests add 27,743 payload bytes compared
// with the 1.30.0 measurement. Raise only the payload ceiling to the
// measured value plus 65 bytes of headroom (12,717,135); the 524-entry
// inventory is unchanged. Theme CSS stays website-only. Fresh Linux CI
// independently checks its actual canonical archive.
//
// Ghostget 0.18.0 packed-size portability after LinkedIn adapter 1.31.0:
// required Linux CI measured the canonical npm archive at 2,330,878
// compressed bytes under the pinned toolchain, 2,613 bytes above the
// previous 2,328,265 ceiling. The same tree's Bun 1.3.14 `pm pack` on
// Linux x64 remains 2,188,108 compressed bytes, SHA-256
// 77b915c17c573d48b421253fd22a8d1e302e03e2aa637dc3e33f57c007fa8763.
// Payload (12,717,070 measured; 12,717,135 ceiling), 524-file inventory,
// and tar bounds are unchanged. Keep the reviewed 4,096-byte
// portability allowance above the largest measured compression:
// 2,330,878 + 4,096 = 2,334,974. This remains a compressor-spread
// allowance, not a guarantee for arbitrary compressors; required CI
// still checks the actual archive under the release toolchain.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` overlay-shell
// honesty path (adapter bundle 1.30.0), measured with no version bump: a
// Bun 1.3.14 `pm pack` on Linux x64 shares
// 12,689,327 payload bytes across exactly 524 files. The bun archive is 2,182,837 compressed
// bytes, SHA-256
// fd447e01ecfbf7bf7f4d68d63110ed3cd74d857e56e65b7e48ca162594c5aa5f.
// HTML-shell omitted-fields projection, adapter notes, changelog, and
// tests add 3,923 payload bytes compared with the 1.29.0 measurement.
// Raise only the payload ceiling to the measured value plus 65 bytes of
// headroom (12,689,392); the packed size stays under the existing packed
// allowance and the 524-entry inventory is unchanged. Theme CSS stays
// website-only. Fresh Linux CI independently checks its actual canonical
// archive.
//
// Ghostget 0.18.0 packed-size portability after LinkedIn adapter 1.29.0:
// required Linux CI measured the canonical npm archive at 2,324,169
// compressed bytes under the pinned toolchain, 497 bytes above the
// previous 2,323,672 ceiling. The same tree's Bun 1.3.14 `pm pack` on
// Linux x64 remains 2,181,867 compressed bytes, SHA-256
// 6520cea342a0b9b570cb33d8f51536656fb5c828177701f42f889afaaff350cf.
// Payload (12,685,404 measured; 12,685,469 ceiling), 524-file inventory,
// and tar bounds are unchanged. Keep the reviewed 4,096-byte
// portability allowance above the largest measured compression:
// 2,324,169 + 4,096 = 2,328,265. This remains a compressor-spread
// allowance, not a guarantee for arbitrary compressors; required CI
// still checks the actual archive under the release toolchain.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` vanity overlay
// and soft-label walk (adapter bundle 1.29.0), measured with no version
// bump: a Bun 1.3.14 `pm pack` on Linux x64 shares
// 12,685,404 payload bytes across exactly 524 files. The bun archive is
// 2,181,867 compressed bytes, SHA-256
// 6520cea342a0b9b570cb33d8f51536656fb5c828177701f42f889afaaff350cf.
// Soft-label skipping, the `/in/:publicIdentifier/overlay/contact-info/`
// RSC GET, adapter notes, and changelog add 2,209 payload bytes compared
// with the 1.28.0 measurement. Raise only the payload ceiling to the
// measured value plus 65 bytes of headroom (12,685,469); the packed size
// stays under the existing packed allowance and the 524-entry inventory
// is unchanged. Theme CSS stays website-only. Fresh Linux CI
// independently checks its actual canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` Contact-info
// overlay fallback (adapter bundle 1.28.0), measured with no version
// bump: a Bun 1.3.14 `pm pack` on Linux x64 shares
// 12,683,195 payload bytes across exactly 524 files. The bun archive is
// 2,181,350 compressed bytes, SHA-256
// daebc81fbe6611c93b9c9b58a9cc245d4397e1a700429cb107baa2a9fbb62dbe.
// The overlay allowlist, RSC projection, GraphQL-unavailable fallback,
// adapter notes, and changelog add 11,194 payload bytes compared with
// the 1.27.0 measurement. Raise only the payload ceiling to the measured
// value plus 65 bytes of headroom (12,683,260); the packed size stays
// under the existing packed allowance and the 524-entry inventory is
// unchanged. Theme CSS stays website-only. Fresh Linux CI independently
// checks its actual canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` non-flight Como
// string-slot bootstrap (adapter bundle 1.27.0), measured with no version
// bump: a Bun 1.3.14 `pm pack` on Linux x64 shares
// 12,672,001 payload bytes across exactly 524 files. The bun archive is
// 2,179,081 compressed bytes, SHA-256
// b35c1ba04ab3e7170668090a1d3fa8cfd4c48e8395765e1b1b93b4866e51c096.
// The drop-before-peel repair, adapter notes, and changelog add
// 1,899 payload bytes compared with the 1.26.0 measurement. Raise only the
// payload ceiling to the measured value plus 65 bytes of headroom
// (12,672,066); the packed size stays under the existing packed allowance
// and the 524-entry inventory is unchanged. Theme CSS stays website-only.
// Fresh Linux CI independently checks its actual canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` multi-escaped
// PROFILE_VIEW breadcrumb peel (adapter bundle 1.26.0), measured with no
// version bump: a Bun 1.3.14 `pm pack` on Linux x64 shares
// 12,670,102 payload bytes across exactly 524 files. The bun archive is
// 2,178,602 compressed bytes, SHA-256
// 6c90a0e415f5b5d4e0466ad679d12167f370353da11f43c2208f5ed0a0780053.
// The escape-tolerant distance capture, adapter notes, and changelog add
// 3,289 payload bytes compared with the 1.25.0 measurement. Raise only the
// payload ceiling to the measured value plus 65 bytes of headroom
// (12,670,167); the packed size stays under the existing packed allowance
// and the 524-entry inventory is unchanged. Theme CSS stays website-only.
// Fresh Linux CI independently checks its actual canonical archive.
//
// Ghostget 0.18.0 source plus the LinkedIn `contacts.read` vieweeMemberUrn
// distance join (adapter bundle 1.25.0), measured with no version bump: a Bun
// 1.3.14 `pm pack` on Linux x64 shares
// 12,666,813 payload bytes across exactly 524 files. The bun archive is
// 2,177,860 compressed bytes, SHA-256
// cf6a9688425c58509b4341e97e98e591eac1cdbfc1c004b37fb6b3f5a89c577b.
// The unique breadcrumb / `vieweeMemberUrn` first-degree join, adapter
// notes, and changelog add 4,055 payload bytes compared with the 0.18.0
// measurement. Raise only the payload ceiling to the measured value plus
// 65 bytes of headroom (12,666,878); the packed size stays under the
// existing packed allowance and the 524-entry inventory is unchanged.
// Theme CSS stays website-only. Fresh Linux CI independently checks its
// actual canonical archive.
//
// Ghostget 0.18.0 joined with main 959f9d2 (LinkedIn deep Como SDUI):
// two fresh Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0
// on darwin arm64 (zlib 1.2.12) are byte-identical: 2,316,774 compressed
// and 12,662,758 payload bytes across exactly 524 files, SHA-256
// 0940ba8e8e406f81093d360df8d6e7be9e972dbeba7b1c88ae51b961b7d0711d.
// The main change contributes exactly 8,687 payload bytes to the prior
// credential-repaired candidate. Preserve its 65-byte payload allowance,
// exact inventory, and 2,802 + 4,096-byte compression allowance. These
// are local measurements; required Linux CI checks its actual npm archive.
//
// Ghostget 0.18.0 final credential-custody repair: two fresh Bun 1.3.14
// builds and npm 11.19.0 packs under Node 24.20.0 on darwin arm64 (zlib
// 1.2.12) are byte-identical: 2,314,832 compressed and 12,654,071 payload
// bytes across the same 524 files, SHA-256
// 01abe7e7a0953670578777aa88e3c3dbe6d095fb2e46298154c37801db576c96.
// The repeated post-probe byte check adds exactly 49 source bytes. Preserve
// the existing 65-byte payload allowance, including the public-manifest
// admission fixtures, and the 2,802 + 4,096-byte compression allowance.
// Fresh required Linux CI must still inspect its actual canonical archive.
//
// Ghostget 0.18.0 reviewed CI repairs: two fresh Bun 1.3.14 builds and
// npm 11.19.0 packs under Node 24.20.0 on darwin arm64 (zlib 1.2.12) are
// byte-identical: 2,314,828 compressed and 12,654,022 payload bytes across
// exactly 524 files, SHA-256
// e1b7edca283b667a1caa7f38d34c7d0b4c677380b464dc4e11ef3e6827f72dbf.
// Every archive byte and mode matches its source. The self-contained skill
// link adds 51 payload bytes; passive policy reads, sanitized state errors,
// exact credential readback and recovery/dispatch corrections add 5,073 bytes
// over the control-boundary candidate below. No inventory entries change.
// Preserve 65 payload bytes of headroom and the exact inventory. The packed
// ceiling remains the measured size plus the last observed 2,802-byte Linux
// spread and reviewed 4,096-byte portability allowance. This is a projection,
// not fresh Linux evidence; required CI checks its actual canonical archive.
//
// Ghostget 0.18.0 control-boundary and idle-performance candidate: two
// fresh Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0 on darwin
// arm64 (zlib 1.2.12) are byte-identical, with 2,313,628 compressed and
// 12,648,898 payload bytes across exactly 524 files, SHA-256
// 6a18ddbf45c787ab22a206eccc75159e745700bab5cbdf34e159f0a240e135a9.
// Every archive byte and mode matches its source. The new immutable syntax
// analysis source adds 1,919 bytes; its callers, bounded approval and response
// handling, monotonic deadlines, thin polling and guide changes add 2,611
// bytes over the first 0.18.0 candidate below. No benchmark or test enters the
// archive. Preserve 65 payload bytes of headroom and the exact inventory.
// The compressed ceiling remains the measured size plus the last observed
// 2,802-byte Linux spread and the reviewed 4,096-byte portability allowance.
// This is a projection, not Linux evidence; fresh pinned Linux CI checks its
// actual canonical archive. The five Release assets remain unchanged.
//
// Ghostget 0.18.0 first candidate, measured after the native control helper, public retrieval
// gateway, operation permissions, editable OpenAPI interfaces, 1Password token
// import and their public guides joined the version projections. Two fresh
// Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0 on darwin arm64
// (zlib 1.2.12) are byte-identical: 2,312,026 compressed and 12,644,368 payload
// bytes across exactly 523 files, SHA-256
// 82364442728547e0ea3c6a2fb105ea58e461f5bab2346e8b8244bf68e4596d54.
// Every archive byte and mode matches its source. The 23 new control/permission
// sources and public guides add 183,467 payload bytes; existing source, SDK and
// documentation changes add the remaining 16,977 bytes over 0.17.6. Native app
// assets, Direct fixtures, tests and dependencies are absent from this archive.
// Preserve 65 payload bytes of headroom and require the exact inventory. Set
// the compressed ceiling to this measured size plus the last observed
// 2,802-byte Linux spread and the reviewed 4,096-byte portability allowance.
// This is a projection, not Linux evidence: required CI checks its actual npm
// archive under the pinned release toolchain. The five Release assets stay fixed.
//
// Ghostget 0.17.6 source plus the LinkedIn `contacts.read` deep Como SDUI
// binding (adapter bundle 1.24.0), measured with no version bump: a Bun
// 1.3.14 `pm pack` on Linux x64 shares
// 12,452,611 payload bytes across exactly 500 files. The bun archive is
// 2,122,424 compressed bytes, SHA-256
// 6fdc9574102d2364548291891b8b81f9c1c1b442a95dfb13dce0d42f7e66944c.
// The deeper walk, `vieweeProfileId` plus vanity identity join, breadcrumb
// or RSC string-row distance, and skill-reference notes add 8,687 payload
// bytes compared with the 0.17.6 measurement. Raise only the payload
// ceiling to the measured value plus 65 bytes of headroom (12,452,676); the
// packed size stays under the existing packed allowance and the 500-entry
// inventory is unchanged. Theme CSS stays website-only. Fresh Linux CI
// independently checks its actual canonical archive.
//
// Ghostget 0.17.6, measured after the shared Paper marketing theme and version
// projections: two Bun 1.3.14 builds and npm 11.19.0 packs under Node 24.20.0
// on darwin arm64 are byte-identical, with 2,258,514 compressed and 12,443,924
// payload bytes across exactly 500 files, SHA-256
// 009e254d04ce94d17cbbe8a09293adcda42cb4b1430469d0d63c376d4c7581be.
// The changelog and package check hook add 407 payload bytes over 0.17.5.
// Preserve 65 bytes of payload headroom, the exact inventory, and the existing
// compressed allowance. Theme CSS is website-only and does not enter the CLI
// archive. Fresh Linux CI independently checks its actual canonical archive.
//
// Ghostget 0.17.5, measured after the bounded newest-window CodeQL analyses
// read joined the 0.17.4 release source and the version bump: two Bun 1.3.14
// builds and npm packs (Node 24.20.0 / npm 11.19.0, darwin arm64) are
// byte-identical, with 2,258,370 compressed and 12,443,517 payload bytes
// across exactly 500 files, SHA-256
// 319fa969d7398386b7f2963cb000a02bd3b99d0fad19a16141bfad1429e10bfb.
// The 0.17.5 changelog entry and version projections add 476 payload bytes
// compared with the 0.17.4 measurement. Raise only the payload ceiling to the
// measured value plus 65 bytes of headroom (12,443,582); the packed size
// stays 9,547 bytes under the existing packed allowance and the 500-entry
// inventory is unchanged. Fresh Linux CI still checks its actual canonical
// archive under the pinned release toolchain.
//
// Ghostget 0.17.4, measured after the npm publication moved into the tag
// Release workflow (#219) and the version bump: two Bun 1.3.14 builds and npm
// packs (Node 24.20.0 / npm 11.19.0, darwin arm64) are byte-identical, with
// 2,258,232 compressed and 12,443,041 payload bytes across exactly 500 files,
// SHA-256
// cff3bf55b9dabfea4b17f590ff83cfbc8c78d8b0b2c338696da82b4c6cb42a1b.
// The 0.17.4 changelog entry and version projections add 819 payload bytes
// compared with the 0.17.3 measurement. Raise only the payload ceiling to the
// measured value plus 65 bytes of headroom (12,443,106); the packed size
// stays 9,685 bytes under the existing packed allowance and the 500-entry
// inventory is unchanged. Fresh Linux CI still checks its actual canonical
// archive under the pinned release toolchain.
//
// Ghostget 0.17.3, measured after the LinkedIn `contacts.read` Como RSC
// flight-array fix (#217) joined the 0.17.2 release source and the version
// bump: a Bun 1.3.14 build and npm pack (Node 24.18.1 / npm 11.16.0, darwin
// arm64) measures 12,442,222 payload bytes across exactly 500 files. The
// 0.17.3 changelog entry and version projections add 629 payload bytes
// compared with the joined measurement below. Raise the payload ceiling to
// the measurement plus 65 bytes of headroom and keep the 500-entry inventory.
// The same pack compresses to 2,261,019 bytes here, 2,694 bytes under the
// previous 2,263,713 packed ceiling, which is less than the 2,802-byte spread
// the Linux release toolchain (zlib 1.3.2.1-motley) showed against darwin
// arm64 for 0.17.0. Raise the packed ceiling to that projected Linux size
// (2,263,821) plus the reviewed 4,096-byte portability allowance: 2,267,917.
// This is a projection from the last measured spread, not a Linux
// measurement; fresh Linux CI still checks its actual canonical archive under
// the pinned release toolchain.
//
// Ghostget 0.17.2 source plus the LinkedIn `contacts.read` Como RSC
// flight-array bootstrap fix (adapter bundle 1.23.0), measured with no version
// bump or changelog entry: two Node 24.18.1 / npm 11.16.0 archives on darwin
// arm64 are byte-identical, with 2,260,707 compressed and 12,441,593 payload
// bytes across exactly 500 files, SHA-256
// 4c1a296100f76cb3ca81e56e4c4cba238ee48b1abf945cb0f8063a2132263570.
// The flight-array decoder, its tests, the rotated implementation identity,
// and the skill references add 3,570 payload bytes compared with the 0.17.2
// measurement. Raise only the payload ceiling to the measured value plus
// 65 bytes of headroom; the packed size stays 3,006 bytes under the existing
// packed allowance and the 500-entry inventory is unchanged. Fresh Linux CI
// still checks its actual canonical archive under the pinned release
// toolchain.
//
// Ghostget 0.17.2, measured after publishing the npm coordinate as ordinary
// software: the package manifest drops its content-policy field and the
// disclosure file leaves the inventory, which now holds exactly 500 files. Two
// Node 24.20.0 / npm 11.19.0 archives on darwin arm64 are byte-identical,
// with 2,256,564 compressed and 12,438,023 payload bytes, SHA-256
// 069ec0c6183d3a9348a58e14f64eb9d8c863b931a7f59b061c1219b3fe7c6413.
// The inventory and changelog changes move the payload by -834 bytes
// compared with the 0.17.1 measurement. Set the payload ceiling to the
// measured value plus 65 bytes of headroom, keep the existing packed
// allowance, and derive the tar bound from the 500-entry inventory. Fresh
// Linux CI still checks its actual canonical archive under the pinned release
// toolchain.
//
// Ghostget 0.17.1, measured after the release-admission log-read fix and the
// version bump: two Node 24.20.0 / npm 11.19.0 archives on darwin arm64 are
// byte-identical, with 2,257,105 compressed and 12,438,857 payload bytes
// across exactly 501 files, SHA-256
// dc47e826f2b771a9d054cbe39195b873277bb8b450644e4e8e54d462900f4c2e.
// The changelog entry and version projections add 332 payload bytes compared
// with the final 0.17.0 measurement. Raise only the payload ceiling by that
// measured delta, preserving 65 bytes of headroom, the existing packed
// allowance, and the exact inventory. Fresh Linux CI still checks its actual
// canonical archive under the pinned release toolchain.
//
// Ghostget 0.17.0, measured after extending script-literal escaping to the
// remaining LinkedIn article, feed, profile, Instagram profile, and X
// transaction page scripts: two Node 24.20.0 / npm 11.19.0 archives on
// darwin arm64 are byte-identical, with 2,256,982 compressed and
// 12,438,525 payload bytes across exactly 501 files, SHA-256
// a934202bbc26e1e1ba1b135bdd3867168c61a9425f6ee5e412ac7622beec0070.
// The shared escape helper and its call sites add 653 payload bytes compared
// with the joined 0.17.0 measurement. Raise only the payload ceiling by that
// measured delta, preserving 65 bytes of headroom, the existing packed
// allowance, and the exact inventory. Fresh Linux CI still checks its actual
// canonical archive under the pinned release toolchain.
//
// Ghostget 0.17.0, measured after joining main (#204 post-close convergence)
// and escaping script-embedded canonical JSON in the LinkedIn post provider:
// two Node 24.20.0 / npm 11.19.0 archives on darwin arm64 are byte-identical,
// with 2,256,815 compressed and 12,437,872 payload bytes across exactly
// 501 files, SHA-256
// 33a15400af2a0acb9eb5b4c3457b153d3898ef8f3295efeb89c948fb07eed6a0.
// The joined browser source delta and the escaping helper add 6,707 payload
// bytes compared with the previous 0.17.0 measurement. Raise the payload
// ceiling by that measured delta, preserving 65 bytes of headroom and the
// exact inventory. Required Linux CI packed the identical payload to
// 2,259,617 bytes under its zlib, 315 bytes above the previous packed ceiling
// and a 2,802-byte spread from macOS. Allow 4,096 bytes above that largest
// measured compression, matching the existing bounded portability allowance;
// fresh Linux CI still checks its actual canonical archive under the pinned
// release toolchain.
//
// Ghostget 0.17.0, measured after joining 0.16.17 and a clean Bun 1.3.14
// build: two Node 24.20.0 / npm 11.19.0 archives on darwin arm64 (zlib 1.2.12)
// are byte-identical, with 2,255,371 compressed and 12,431,165 payload bytes
// across exactly 501 files, SHA-256
// a12827c27f171db30424232c9222630bd4934faa30ecb7e3a985f33b8c8a3e2a.
// Canonical branding and backward-compatible state/plugin discovery add
// 11,761 payload bytes compared with 0.16.17. Raise only the payload ceiling
// by that measured delta, preserving 65 bytes of headroom, the existing
// compressed allowance, and the exact inventory. Fresh Linux CI still checks
// its actual canonical archive under the pinned release toolchain.
//
// Same-boot post-close convergence on canonical GitHub 0.16.17 composes the
// exact 12,419,404-byte release archive with the byte-identical 6,112-byte
// browser source delta, yielding 12,425,516 unpacked bytes across the same
// 501 files. Preserve 26 bytes of unpacked allowance and the existing packed
// portability bound; this source-only candidate does not claim a new release.
//
// Canonical GitHub 0.16.17 with KB 0.19.6 and upstream Sweet Cookie 0.4.3:
// two identical official Node 24.20.0 / npm 11.19.0 archives on darwin-arm64
// with zlib 1.3.2.1-motley-42c2f19 measure 2,255,577 packed and
// 12,419,404 payload bytes across exactly 501 files, SHA-256
// a0cfd266754f674499face82f8e3a9ef60d9113ddea861012626d6272cb550e3.
// Every archived byte/mode matches source. Same-toolchain main 6940c85
// measures 2,255,428 packed / 12,419,056 payload bytes; the dependency
// and changelog changes add 348 payload bytes. Keep the packed ceiling,
// add only that measured payload delta, retain 65 payload bytes of headroom,
// and preserve the exact 501-file/entry inventory and derived tar bound.
// Required Linux CI independently checks its actual canonical npm archive.
//
// Canonical GitHub 0.16.16, measured after exact browser-claim drift recovery:
// two identical Node 24.20.0 / npm 11.19.0 archives have 2,253,071 compressed
// and 12,419,056 payload bytes across exactly 501 files, SHA-256
// a5195435e2d9a524e66a9e72b99b5472d8680c9467ee1bb54898a0e4dd01d401.
// Every file/mode matches source; 491 files are unchanged from published .15.
// Browser admission adds 255 bytes and the changelog 245; other edits only
// project the new version. Identical raw tar recompresses to 2,255,428 bytes
// under the available motley build. Keep the 2,259,302 compressed ceiling;
// increase only payload by the measured 500 bytes, retaining 65 bytes of
// headroom, exactly 501 files/entries and the derived 12,933,120 tar ceiling.
// Fresh Linux CI must still verify its actual canonical npm archive.
//
// Canonical GitHub 0.16.15, measured after the qualified consumer-type repair:
// two identical Node 24.20.0 / npm 11.19.0 archives have 2,252,952 compressed
// and 12,418,556 payload bytes across exactly 501 files, SHA-256
// 3a0adf3c9584a831a5b29ecab47eb1ace4a9e2cacfafabd64cb6eb3d10998226.
// Every file/mode matches source; 492 files are unchanged from 0.16.14.
// The new changelog adds 250 payload bytes; other packaged edits project .15.
// Identical raw tar recompresses to 2,255,325 bytes under the available motley
// build. Retain every existing bound: 3,977 bytes above that measured maximum,
// 65 payload bytes remaining, exactly 501 files/entries and the same tar bound.
// Fresh Linux CI still verifies its actual canonical npm archive.
//
// Canonical GitHub 0.16.14, measured with Bun 1.3.14 build and two
// byte-identical Homebrew Node 24.20.0 / npm 11.19.0 packs: 2,252,826
// compressed / 12,418,306 payload bytes / 501 files, SHA-256
// 1bf550bba8f75aa0933fa9fcd9def7e446e1a60a5b3a3e12555ef934caf23969.
// Every file/mode matches the source; 492 files are unchanged from 0.16.13.
// Version projections and the recovery changelog add 494 payload bytes.
// Recompressing the identical raw tar with zlib 1.3.2.1-motley produces
// 2,255,206 bytes, versus 2,252,826 with local zlib 1.2.12. The retained
// 0.16.13 raw tar likewise reproduces the failed Linux pack's exact size
// (2,255,037) under motley without changing any tar byte. That failed npm
// archive itself was not retained, so recompression does not recover its identity.
// Allow 4,096 bytes above the largest measured compression (2,255,206),
// covering the current 2,380-byte and historical 3,543-byte spreads. This
// bounded portability allowance is not a guarantee for arbitrary compressors:
// required CI checks the actual npm archive under the pinned release toolchain.
// Preserve 315 payload bytes of headroom and exactly 501 files/entries.
// All prior measurements and the failed 0.16.13 tag remain historical.
//
// Canonical GitHub 0.16.13 joined with exact main 6e8f757, measured after a
// clean Bun 1.3.14 build with Node 24.20.0 / npm 11.19.0. Two archives are
// byte-identical: 2,252,656 packed / 12,417,812 payload bytes / 501 files,
// SHA-256 24af5d712ac7633931ecab576860819a5266eb2b1bc9b262bfa61069a77fd420.
// This pair includes the corrected canonical starting version in CHANGELOG.
// Every file and mode matches the combined source. The exact main archive is
// 2,252,267 packed / 12,416,444 payload bytes / 501 files. Canonical install
// docs and version projections add 389 packed / 1,368 payload bytes; 492
// files are unchanged, with eight changed paths and one version-chunk rename.
// Retain zero packed headroom and current main's 315 payload bytes, with
// exactly 501 files/entries. Earlier candidate measurements are historical.
//
// Canonical GitHub 0.16.13, measured with npm 11.19.0 / Node 24.20.0 after
// a clean Bun 1.3.14 build: 2,249,656 packed / 12,408,429 unpacked / 497 files.
// Same-toolchain unchanged main 95debf1 measured 2,249,213 packed /
// 12,407,061 unpacked / 497 files. Canonical installation docs, release notes,
// version identity, and package script metadata add 443 packed / 1,368 unpacked
// bytes. The baseline npm archive itself exceeded the old packed ceiling by
// 4,432 bytes. Admit only this measured npm maximum with no packed headroom;
// retain main's remaining 32 unpacked bytes of headroom and exact inventory.
// Candidate SHA-256: a36b0c73d12741465b5e2def214530524c99f8692c6ebe0ed0f72ca089efe89a.
// Baseline SHA-256: 1f0ab1e2c15a91e81ac7e8c671d4841fbb0cd0ee2b978b884f09233d168f6515.
//
// Joined main 4045057 (X Viewer/Bookmarks evidence and browser fixture controls)
// after clean Bun 1.3.14 builds and two identical npm 11.19.0 packs per source:
// baseline 2,249,250 packed / 12,407,079 payload bytes / 497 files;
// candidate 2,252,267 packed / 12,416,444 payload bytes / 501 files,
// SHA-256 d3398684f63eff73167dce16074f07d2db4bbbaeb4174fad9d77dbabd49bb3f7.
// The transcript owner and browser diagnostics add 3,017 packed and 9,365
// payload bytes, with all eleven generated SDK files unchanged. Main's npm
// archive already exceeds its packed ceiling by 4,469 bytes; retain no packed
// headroom and preserve current main's 315 payload bytes of headroom, with
// exactly 501 files/entries. The earlier measurements below remain historical.
//
// The same transcript candidate now includes content-free browser lifecycle
// diagnostics used to qualify an existing CI startup failure. Two npm 11.19.0
// packs are byte-identical: 2,252,230 packed / 12,416,426 unpacked bytes,
// 501 files, SHA-256 747a59db718874ab8a33d529c251e23ba5a66afb09116ad5a95b326c063fb575.
// Compared with the transcript-only candidate below, browser.ts adds 925 packed
// and 3,455 unpacked bytes. All eleven SDK dist files remain byte-identical.
// Retain zero packed headroom, 32 unpacked bytes, and exactly 501 files/entries.
//
// Transcript persistence owner, measured from exact main 5c25433 after clean
// Bun 1.3.14 builds with npm 11.19.0. Two candidate packs were byte-identical:
// 2,251,305 packed bytes, 12,412,971 unpacked bytes and 501 files, SHA-256
// d8720197e108a996373f4fda5d72ff4f938f82ca4d325be53917b052f20b01c2.
// The same-toolchain baseline was 2,249,213 packed / 12,407,061 unpacked bytes
// and 497 files. Four internal persistence modules, the archive caller and
// its explicit package allowlist add 2,092 packed / 5,910 unpacked bytes.
// All generated SDK files remain byte-identical. The baseline already exceeded
// the previous packed ceiling; use the measured candidate with no packed
// headroom, retain only the remaining 32 unpacked bytes, and require exactly
// 501 files/entries. This measurement does not admit a later release/source.
//
// X Viewer and Bookmarks query-ID refresh on 0.16.12, measured from the
// 2026-09-08 22:06 client-web drop after a clean Bun 1.3.14 build:
// 12,407,079 unpacked bytes and 497 files. Same-train LinkedIn
// contacts.read SDUI successor measured 12,406,778 unpacked bytes and
// 497 files. Recording the current Viewer main.cd39a626fdb81748a.js
// source chunk plus Bookmarks evidence and snapshot tests accounts for
// +301 unpacked bytes with no file-count change. Preserve the prior 315
// unpacked bytes of residual headroom and the existing packed ceiling,
// which still covers the bun pack and the prior npm 11.19.0 gzip
// allowance. The omitted-private publication variant adds 21 unpacked
// bytes and remains inside that headroom.
//
// LinkedIn contacts.read SDUI successor on 0.16.11, measured after a
// clean Bun 1.3.14 build: 12,406,778 unpacked bytes and 497 files.
// Same-train LinkedIn contacts.read (PR #189) measured 2,108,672 packed /
// 12,397,049 unpacked bytes and 497 files. SDUI binding, GraphQL
// contact-info contract, and reviewed adapter, catalog, plugin, runtime,
// and test edits account for +9,729 unpacked bytes with no file-count
// change. Preserve the prior 315 unpacked bytes of residual headroom and
// the existing packed ceiling, which still covers the bun pack and the
// prior npm 11.19.0 gzip allowance.
//
// LinkedIn contacts.read candidate on 0.16.11, measured after a clean
// Bun 1.3.14 build. Two bun pm pack archives were byte-identical:
// 2,108,672 packed bytes, 12,397,049 unpacked bytes and 497 files.
// Their SHA-256 was
// 7e0467f54474f749ddd5cd2e3b8a4ed433a761a96b7aa9c9942bd382077264bc.
// Same-train 0.16.11 measured 2,238,339 packed / 12,355,344 unpacked
// bytes and 493 files. Four Contact-info modules plus reviewed adapter,
// catalog, plugin, and runtime edits account for +4 files and
// +41,705 unpacked bytes. Preserve the prior 315 unpacked bytes of
// residual headroom and the existing packed ceiling, which still covers
// the bun pack and the prior npm 11.19.0 gzip allowance.
//
// Native Effect lifecycle candidate 0.16.11, measured from source ff7a76b
// against released main 521922ed after clean Bun 1.3.14 builds.
// Two npm 11.19.0 packs were byte-identical: 2,238,339 packed bytes,
// 12,355,344 unpacked bytes and 493 files. Their SHA-256 was
// 4d0b86e270fbeece902f10175d0c9b453ec1c2fbf247cd9b156e5dc659abd280.
// The Bun archive had the same canonical paths, bytes and modes.
// The same-run baseline was 2,230,226 packed / 12,323,111 unpacked
// bytes and 485 files. Eight native lifecycle modules plus the version
// and caller changes account for +8,113 packed / +32,233 unpacked bytes.
// Preserve only the baseline's measured 6,442 packed and 315 unpacked
// bytes of residual headroom, with exactly 493 files/entries. The generated
// version chunk is renamed and its two imports updated; eight other generated
// files are unchanged. These limits add only the measured delta from main.
//
// Historical Reddit read-failure measurement:
// After a clean Bun 1.3.14 build, two npm 11.16.0 packs of the Reddit
// read-failure candidate were byte-identical:
// 2,232,402 packed bytes, 12,322,791 unpacked bytes, and 485 files.
// Their SHA-256 was
// 0ee7396258a400d69a81fffb80e2d0b3808326c5ea837a47ff464e2ca606022e.
// Current main measured 2,229,858 packed / 12,320,769 unpacked bytes and
// 485 files. The two changed Reddit runtime and test payloads account for
// +2,544 packed / +2,022 unpacked bytes. Preserve main's reviewed 4,266
// packed and 635 unpacked bytes of headroom with an exact 485-file inventory.
// These ceilings change by only the measured delta from main.
//
// Historical combined 0.16.9 company-read and cleanup candidate:
// 2,229,858 packed bytes, 12,320,769 unpacked bytes, and 485 files.
// Their SHA-256 was
// 7b72a20a95ef0e92feec1c6e75b556800dc08215f142bac0fa6c24b53fd74928.
// Same-run main 154e33e measured 2,230,119 packed / 12,318,890 unpacked
// bytes and 482 files. Three local company/failure modules, five changed
// payloads, and no removed files account for -261 packed / +1,879 unpacked
// bytes. Both normal builds preserved all 11 generated files byte-for-byte.
// The 2,234,124-byte packed ceiling leaves 4,266 bytes above this candidate.
// Retain current main's 635 unpacked bytes of headroom and exact 485-file
// inventory. These ceilings change by only the measured delta from main.
//
// Historical PR176 0.16.9 measurement, including the X identity fixes:
// two npm 11.19.0 packs after a clean Bun 1.3.14 build were byte-identical:
// 2,230,059 packed bytes, 12,318,665 unpacked bytes, and 482 files.
// Their SHA-256 was
// 08e3dc841233150b5f09a698cfc56b47f8c0a62d013d22167849164f65de28d1.
// Same-run main ab952fd measured 2,215,741 packed / 12,254,140 unpacked
// bytes and 466 files. Growth includes 16 new read/scanner source files,
// changed orchestration and the 0.16.9 source identity and release notes.
// The 2,234,385-byte packed ceiling leaves 4,326 bytes above this candidate,
// 842 fewer than the fresh baseline's residual allowance. Retain main's
// 860 unpacked bytes of headroom, 78 below the prior Effect allowance,
// and an exact 482-file inventory. Both normal builds preserved all 11
// generated files byte-for-byte.
//
// Historical 0.16.8 measurement: two npm 11.19.0 packs of the
// browser cleanup convergence candidate were byte-identical:
// 2,216,583 packed bytes, 12,248,757 unpacked bytes, and 466 files.
// Their SHA-256 was
// e7776ab116c9b16f25385b5b973a0df52f1347b21f0083b03645e19a1304dd9b.
// Published 0.16.7 is 2,214,418 packed bytes, 12,233,921 unpacked bytes, and
// 466 files from npm 11.19.0. Its SHA-256 was
// 7b13498e1070d95f2a1d564caba41f1eebc6a32a7a8e078373fe2fec564060a8.
// The 2,165 packed and 14,836 unpacked bytes of growth are the reviewed
// LinkedIn activity pagination, cleanup convergence, and release notes.
// Prior CI measured a 3,543-byte Linux/macOS gzip spread.
// That candidate retained a 2,220,909-byte packed ceiling, 4,326 packed bytes
// and 938 unpacked bytes of headroom, with exactly 466 files.
// The RFC 8785 canonical-ordering migration grew the packed tarball past the
// prior ceiling: ubuntu CI packed 11,689,843 bytes and macOS packed
// 11,680,162 (a 9,681-byte gzip spread across the new dual-read serializer
// and verification-path helpers). Retain 4,096 packed bytes of headroom over
// the larger measurement: 11,689,843 + 4,096 = 11,693,939.
// The local-custody v0.6.0 release-asset pin changes only the packed
// manifest's dependency spec (+28 bytes): a clean npm 11.19.0 pack
// --ignore-scripts on this branch measured 11,680,330 packed bytes on macOS,
// 8 below the same-run baseline's 11,680,338. Retain the existing ceiling.
// The contract stableJson consolidation onto the shared canonical-JSON
// encoder repacked the rebuilt chunks: two npm 11.19.0 packs on this branch
// were byte-identical at 11,680,809 packed bytes on macOS. Retain the
// existing ceiling.
//
// Staged local-custody sidecar adoption adds exactly one packed file,
// src/custody-engine.ts (+1,026 source bytes), inside the unchanged
// entrypoint set: a clean npm 11.19.0 pack --ignore-scripts on this branch
// measured 11,681,840 packed bytes / 22,677,414 unpacked bytes across
// exactly 565 files on macOS, archive SHA-256
// c47c8d3767080acddfa48b353aff98fae738c45a5ba16708d63e857dd839480a. Raise the
// packed inventory to 565 and retain the existing packed ceiling.
// Browser-profile discovery adds exactly three packed production files:
// src/browser-profiles.ts, src/browser-profiles-cli.ts and
// src/control/browser-choices.ts, alongside edits to the CLI, usage, auth,
// control service, menu, TUI and vault sources and the rebuilt dist chunks.
// `bun pm pack --ignore-scripts` with Bun 1.3.14 on darwin arm64 measured
// exactly 575 files/entries and 22,786,274 payload bytes; archive SHA-256
// 6fba42075451240d07bf5ecdad5d9ce485754e6604277ae8811c03e92355a457. Linux CI
// measured the same 22,786,274 payload bytes. Raise the inventory to 575 and
// restore the reviewed 65-byte payload allowance:
// 22,786,274 + 65 = 22,786,339. Retain the proven compressed ceiling; this
// local pack measured 11,572,706 compressed bytes, under it. Required Linux
// CI and Release independently measure and admit their exact npm archives.
//
// Usage-driven contract repair adds two packed source files
// (src/contract-repair-inbox.ts and src/contracts-repair.ts) alongside the
// runtime, CLI, schema and vocabulary edits and the regenerated dist
// bundles. `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64
// measured 11,959,007 packed bytes, 23,268,400 unpacked bytes across
// exactly 591 files; archive SHA-256
// c347ae9a739bd49660b7daea38fc799a08389616bad7b99801b00eb6e9ace7d1. Carry the
// largest observed darwin-to-Linux packed projection for this inventory
// (+12,387 bytes) plus the reviewed 4,096-byte portability allowance:
// 11,959,007 + 12,387 + 4,096 = 11,975,490. The payload ceiling carries the
// observed 353-byte projection plus the reviewed 65-byte allowance:
// 23,268,400 + 353 + 65 = 23,268,818.
// The Ghostget 0.18.26 website /docs/ move and comparison pages lengthen the
// shipped README's canonical guide URLs by 124 bytes and add a new 874-byte
// CHANGELOG section, over the unchanged 591-file usage-repair inventory and
// same-length version strings: `npm pack --ignore-scripts` with npm 11.19.0
// on darwin arm64 measured 11,959,411 packed bytes, 23,269,398 unpacked
// bytes; archive SHA-256
// 6cd3c8989b9258ae9007aa5509cfd16171375f5d1b5916c7439644fbecc6dfa8. Carry the
// same projections and allowances: 11,959,411 + 12,387 + 4,096 = 11,975,894
// packed; 23,269,398 + 353 + 65 = 23,269,816 unpacked.
// Ghostget 0.18.27 adds the trailing-slash moved-guide redirects to
// vercel.json (outside the package) and a 355-byte CHANGELOG section over
// the 0.18.26 inventory: `npm pack --ignore-scripts` with npm 11.19.0 on
// darwin arm64 measured 11,959,529 packed bytes, 23,269,753 unpacked bytes
// across exactly 591 files; archive SHA-256
// dc1e8d6d400a601b22224111403a1fe50f96ac4d0461571d8a763b72ceeda2c2. Carry the
// same projections and allowances: 11,959,529 + 12,387 + 4,096 = 11,976,012
// packed; 23,269,753 + 353 + 65 = 23,270,171 unpacked.
// Ghostget 0.18.28 rewrites the homepage and package description in plain
// language (+36 shipped bytes in package.json) and adds a 664-byte
// CHANGELOG section over the 0.18.27 inventory: `npm pack --ignore-scripts`
// with npm 11.19.0 on darwin arm64 measured 11,959,793 packed bytes,
// 23,270,453 unpacked bytes across exactly 591 files; archive SHA-256
// b68abd4a40f98b0ea466f78fa4383c481f8cd5b7c0c96d57127b75ae2792b5d5. Carry
// the same projections and allowances: 11,959,793 + 12,387 + 4,096 = 11,976,276
// packed; 23,270,453 + 353 + 65 = 23,270,871 unpacked.
// Ghostget 0.18.29 adds the Threads public trailing-window views counter:
// the meta-web carrier extraction and coverage, the threads-web 1.9.0
// manifest, and the retained 1.8.0 predecessor snapshot raise the inventory
// to exactly 592 files. `npm pack --ignore-scripts` with npm 11.19.0 on
// darwin arm64 measured 11,974,295 packed bytes, 23,294,815 unpacked bytes;
// archive SHA-256
// 0725e564d463965ca9b6ca8fdfb80eb712c7f4573c9a73acf499a398882cf49f. Carry the
// same projections and allowances: 11,974,295 + 12,387 + 4,096 = 11,990,778
// packed; 23,294,815 + 353 + 65 = 23,295,233 unpacked.
// Ghostget 0.18.30 adds the homepage hero field (website-only, excluded from
// the package) and a 523-byte CHANGELOG section over the 0.18.29 inventory:
// `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64 measured
// 11,962,148 packed bytes, 23,295,338 unpacked bytes across exactly 592
// files; archive SHA-256
// 20f08e21c8f2063334e77597453bf984dcc1849c2447689fb166b23e35f76eb0. Carry
// the same projections and allowances: 11,962,148 + 12,387 + 4,096 = 11,978,631
// packed; 23,295,338 + 353 + 65 = 23,295,756 unpacked.
// The built-in WebMCP Registry provider adds exactly four packed production
// files (src/providers/webmcp.ts, src/providers/webmcp-runtime.ts,
// src/plugins/webmcp/plugin.ts and the bundled
// src/assets/adapters/webmcp/wrench-web-adapter.json) alongside generated
// catalog, contract-identity, documentation and rebuilt dist edits, raising
// the inventory to exactly 596 files. `npm pack --ignore-scripts` on that
// branch measured 11,970,845 packed bytes, 23,340,769 unpacked bytes;
// archive SHA-256
// df22787bbd6619f9b6f980505ed62a8f186bff0080cc269fd7ebcb21baa6d4eb. The same
// projections and allowances then gave 11,970,845 + 12,387 + 4,096 =
// 11,987,328 packed; 23,340,769 + 353 + 65 = 23,341,187 unpacked.
// Ghostget 0.18.31 adds its release identity: package and source version
// strings, the new CHANGELOG section, README, docs, install references, and
// rebuilt dist chunks over the unchanged 596-file WebMCP inventory:
// `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64 measured
// 11,971,298 packed bytes, 23,341,797 unpacked bytes; archive SHA-256
// b6366e9a5eb4060629075ef2650f63c5a8939ffedde396301ebb43f0124a5980. Carry
// the same projections and allowances: 11,971,298 + 12,387 + 4,096 =
// 11,987,781 packed; 23,341,797 + 353 + 65 = 23,342,215 unpacked.
// Ghostget 0.18.32 adds the homepage related-product family section
// (website-only, excluded from the package), its CHANGELOG section and the
// release identity over the unchanged 596-file inventory: `npm pack
// --ignore-scripts` with npm 11.19.0 on darwin arm64 measured 11,983,933
// packed bytes, 23,342,196 unpacked bytes; archive SHA-256
// 647187cc462dcd40a127f5a2c2f17513196a4d71bec94e95a967b6f5256e75b1. Carry
// the same projections and allowances: 11,983,933 + 12,387 + 4,096 =
// 12,000,416 packed; 23,342,196 + 353 + 65 = 23,342,614 unpacked.
// Ghostget 0.18.33 re-tags the 0.18.31 WebMCP content for npm publication
// and website promotion after the durable by-tag Release projection
// failure; its CHANGELOG section and rebuilt dist chunks shift the
// unchanged 596-file inventory: `npm pack --ignore-scripts` with npm
// 11.19.0 on darwin arm64 measured 11,971,738 packed bytes, 23,342,705
// unpacked bytes; archive SHA-256
// e1e1ebb75b1c4c64e67c84bfc5087626258fab6e20ed6285390da4c320bb4d8e. Carry
// the same projections and allowances: 11,971,738 + 12,387 + 4,096 =
// 11,988,221 packed; 23,342,705 + 353 + 65 = 23,343,123 unpacked.
// Ghostget 0.18.34 adds the WebMCP explainer and how-to pages plus the
// registry-scale README and homepage copy (website-only sources stay
// outside the package); its CHANGELOG section and rebuilt dist chunks
// shift the unchanged 596-file inventory: `npm pack --ignore-scripts`
// with npm 11.19.0 on darwin arm64 measured 11,971,987 packed bytes,
// 23,343,331 unpacked bytes; archive SHA-256
// 045a8cf8389e54e18c28e7580a9c6c5494d9c6cca38f39bc1e4ece4b4b079e05. Carry
// the same projections and allowances: 11,971,987 + 12,387 + 4,096 =
// 11,988,470 packed; 23,343,331 + 353 + 65 = 23,343,749 unpacked.
// The launch-intent cleanup recovery adds the unbound launch-intent
// quiescence proof, its recovery admission wiring, and the replacement
// repair/retention tests: a clean npm 11.19.0 pack --ignore-scripts on
// darwin arm64 measured 596 files/entries and 23,346,582 payload bytes;
// archive SHA-256 041f172721702456c214f78cd390417e285aed417e72bd0b45372fefd71bfa6c.
// Carry the same projections and allowances: 11,972,555 + 12,387 + 4,096 =
// 11,989,038 packed; 23,346,582 + 353 + 65 = 23,347,000 unpacked.
// Ghostget 0.18.35 adds the WebMCP editorial figure and homepage registry
// panel (website-only sources stay outside the package); its CHANGELOG
// section and rebuilt dist chunks shift the unchanged 596-file inventory:
// `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64 measured
// 11,972,733 packed bytes, 23,346,995 unpacked bytes; archive SHA-256
// 1a9a87defe7a0f4f7a628f6cb2ce70d701fe500770df1184c96c87874620cc97. Carry
// the same projections and allowances: 11,972,733 + 12,387 + 4,096 =
// 11,989,216 packed; 23,346,995 + 353 + 65 = 23,347,413 unpacked.
// The confirmed-write intent fence adds the intent type, intent ledger
// claim, run-journal scan, per-pass generation-chain memory, terminal
// intent projection, and the auth-record refusals to the confirmed-write
// model, platform, program, and runtime sources: exactly 10,511 payload
// bytes over the unchanged 596-file 0.18.35 inventory. Two
// `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin arm64 were
// byte-identical at 11,975,697 packed bytes, 23,357,506 unpacked bytes;
// archive SHA-256
// 444e23bbbe782aa5bf22980a28bdde76b474bd299039eb1a610e4211f05895e5. Carry
// the same projections and allowances: 11,975,697 + 12,387 + 4,096 =
// 11,992,180 packed; 23,357,506 + 353 + 65 = 23,357,924 unpacked.
// The portable `not-applied` claim fence records a caller's claim and keeps
// the idempotency ledger. Its edits to the portable recovery module,
// runtime, run-journal and CLI sources and the provider-plugins reference
// add exactly 8,842 payload bytes over the unchanged 596-file intent-fence
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin
// arm64 were byte-identical at 11,977,961 packed bytes, 23,366,348 unpacked
// bytes; archive SHA-256
// 5300d2503ae48a50ace5e1edc76a45d8b2e32724d8fd34fad09cf7405e083e85. Carry
// the same projections and allowances: 11,977,961 + 12,387 + 4,096 =
// 11,994,444 packed; 23,366,348 + 353 + 65 = 23,366,766 unpacked.
// The strict canonical JSON value domain rejects sparse arrays, non-plain
// prototypes, accessors, symbols and non-finite numbers in canonicalJson and
// the provider-plugin semantic value, and adds the named __proto__
// read-result regression. This adds 9,681 payload bytes over the unchanged
// 596-file inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0
// on darwin arm64 were byte-identical at 11,980,765 packed bytes, 23,376,029
// unpacked bytes; archive SHA-256
// cfcd1f3db620ed7529a54f65fd374959154f9417399443f994f035f060feefab. Carry the
// same projections and allowances: 11,980,765 + 12,387 + 4,096 = 11,997,248
// packed; 23,376,029 + 353 + 65 = 23,376,447 unpacked.
// Injective session-secret file names keep every unambiguous historical name,
// give coordinates whose historical stem splits more than one way a
// dot-joined name, and let the owning coordinate adopt an ambiguous
// historical file only when its body names that coordinate. This adds 14,199
// payload bytes over the unchanged 596-file inventory. Two `npm pack
// --ignore-scripts` runs with npm 11.19.0 on darwin arm64 were byte-identical
// at 11,983,769 packed bytes, 23,390,228 unpacked bytes; archive SHA-256
// 9b9f358333b911d0ffbfa0602b77281c8b3fa7476c6baba9a376ca14f0f76dc3. Carry the
// same projections and allowances: 11,983,769 + 12,387 + 4,096 = 12,000,252
// packed; 23,390,228 + 353 + 65 = 23,390,646 unpacked.
// The path-helper reaper election lets exactly one recoverer quarantine a
// dead owner's claim, verifies the moved claim's identity, and restores any
// live claim it moved by a no-clobber link. This adds 10,948 payload bytes
// over the unchanged 596-file inventory. Two `npm pack --ignore-scripts` runs
// with npm 11.19.0 on darwin arm64 were byte-identical at 11,986,281 packed
// bytes, 23,401,176 unpacked bytes; archive SHA-256
// a93c3400369b926d7dc23451d8ddb5b2b2cb47ccd733b09fda9000345415b16c. Carry the
// same projections and allowances: 11,986,281 + 12,387 + 4,096 = 12,002,764
// packed; 23,401,176 + 353 + 65 = 23,401,594 unpacked.
// The unreleased copy pass over the path-helper reaper election rewrites the
// package description, README, Agent Skill summary and plugin examples, CLI
// banner, TUI strings, and support value proposition, and adds an Unreleased
// CHANGELOG section, over the unchanged 596-file inventory: 637 payload bytes
// over the reaper-election measurement. `npm pack --ignore-scripts` with npm
// 11.16.0 on darwin arm64 measured 11,997,841 packed bytes, 23,401,813
// unpacked bytes; archive SHA-256
// 8614f1f031979371907772a6284888527064014b18f81cc26c4ee2f1f2bdcb56.
// Compressed size varies with the local zlib. Carry the same projections and
// allowances: 11,997,841 + 12,387 + 4,096 = 12,014,324 packed;
// 23,401,813 + 353 + 65 = 23,402,231 unpacked.
// The media lifecycle hardening spawns yt-dlp in its own process group,
// fsyncs every revision file and parent directory around the promotion
// rename, quarantines only a torn head revision, and fences promotion with
// the item lock's token. This adds 15,821 payload bytes over the unchanged
// 596-file inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0
// on darwin arm64 were byte-identical at 11,990,908 packed bytes, 23,417,634
// unpacked bytes; archive SHA-256
// 519e4bfdfd61196722eda53965398a7553afb1818a399cc322004665a04574a2. Carry the
// same projections and allowances: 11,990,908 + 12,387 + 4,096 = 12,007,391
// packed; 23,417,634 + 353 + 65 = 23,418,052 unpacked.
// The read-path capability gives the menu-bar snapshot a branded read-only
// auth incarnation reader and moves missing incarnation creation to
// control-service startup under admission. This adds 4,724 payload bytes over
// the unchanged 596-file inventory. Two `npm pack --ignore-scripts` runs with
// npm 11.19.0 on darwin arm64 were byte-identical at 11,992,132 packed bytes,
// 23,422,358 unpacked bytes; archive SHA-256
// 01875f12ab73a49d6c7d6bf520dc3d318db816addee2fa7981889f35c958cf7c. Carry the
// same projections and allowances: 11,992,132 + 12,387 + 4,096 = 12,008,615
// packed; 23,422,358 + 353 + 65 = 23,422,776 unpacked.
// The approval broker binds each allow-once grant to its holder's use secret
// at request time and admits no other caller, so a crashed holder leaves no
// reusable lease. This adds 2,005 payload bytes over the unchanged 596-file
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin
// arm64 were byte-identical at 11,992,764 packed bytes, 23,424,363 unpacked
// bytes; archive SHA-256
// b12909f08f7c19460ced56e30619f4860a1183f4b0106170c07837dae577a937. Carry the
// same projections and allowances: 11,992,764 + 12,387 + 4,096 = 12,009,247
// packed; 23,424,363 + 353 + 65 = 23,424,781 unpacked.
// The formal-verification foundation adds the verify, verify:claims,
// verify:quint, and verify:lean scripts, the verification typecheck project,
// the check chain's verify step, and the exact Quint devDependency to
// package.json. The verification sources, claims register, and assurance page
// stay outside the package. This adds 630 payload bytes over the unchanged
// 596-file inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0
// on darwin arm64 were byte-identical at 11,992,902 packed bytes, 23,424,993
// unpacked bytes; archive SHA-256
// f2c9be480d9ffe8aa7ae642af2523491745987ee9bed58b66d37f7d2f4d6c4ed. Carry the
// same projections and allowances: 11,992,902 + 12,387 + 4,096 = 12,009,385
// packed; 23,424,993 + 353 + 65 = 23,425,411 unpacked.
// The README paragraph that links the thread through hraness and the ALGAL
// vision adds 419 payload bytes to README.md over the unchanged 596-file
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.16.0 on darwin
// arm64 were byte-identical at 12,005,185 packed bytes, 23,425,412 unpacked
// bytes; archive SHA-256
// 874784766ccc8e505bc73de42d1aad7b95ce6acd59ea121914ea6f9a6dbffe85.
// Compressed size varies with the local zlib. Carry the same projections and
// allowances: 12,005,185 + 12,387 + 4,096 = 12,021,668 packed;
// 23,425,412 + 353 + 65 = 23,425,830 unpacked.
// The Quint fence and path-claim models export the pure fence cores
// (`intentFenceBlocker`, `reconciledRecoveryRelease`, `priorRunDisposition`)
// for trace replay and run every model's replay test from the manifest through
// the new verify:quint:replay script in package.json. This adds 2,058 payload
// bytes over the unchanged 596-file inventory. Two `npm pack --ignore-scripts`
// runs with npm 11.19.0 on darwin arm64 were byte-identical at 11,993,645
// packed bytes, 23,427,470 unpacked bytes; archive SHA-256
// 87e0c7bc0e6037f05c2d1ae83672de5b9abc016e2516f96a31f9a3b1bac640a4. Carry the
// same projections and allowances: 11,993,645 + 12,387 + 4,096 = 12,010,128
// packed; 23,427,470 + 353 + 65 = 23,427,888 unpacked.
// The crash harness adds one test-only branch to storage: under NODE_ENV=test
// with a crash plan, it passes the plan and a Bun preload that swaps the
// helpers' durable node:fs effects for a crash port. The shipped state and
// path helpers are unchanged, and the port, preload, fixture, and harness stay
// outside the package. This adds 1,215 payload bytes over the unchanged
// 596-file inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on
// darwin arm64 were byte-identical at 11,993,622 packed bytes, 23,428,685
// unpacked bytes; archive SHA-256
// ece2627c6967cb8cf201ebdd598cfc57df555e069feafdd09c38ba6a775c32da. Carry the
// same projections and allowances: 11,993,622 + 12,387 + 4,096 = 12,010,105
// packed; 23,428,685 + 353 + 65 = 23,429,103 unpacked.
// The independent oracles add the verify:oracles script and its step in the
// verify chain to package.json. The Rust oracle, the golden vectors, and their
// tests stay outside the package. This adds 233 payload bytes over the
// unchanged 596-file inventory. Two `npm pack --ignore-scripts` runs with npm
// 11.19.0 on darwin arm64 were byte-identical at 11,993,659 packed bytes,
// 23,428,918 unpacked bytes; archive SHA-256
// 5162451c3acb46616a35fe38729d9e26291e283e2baceabfc665c29aa2020f79. Carry the
// same projections and allowances: 11,993,659 + 12,387 + 4,096 = 12,010,142
// packed; 23,428,918 + 353 + 65 = 23,429,336 unpacked.
// The Lean encodings export `updateLengthFramedHash` from the provider plugin
// registry so the differential test can compare the production length-framed
// hash with its Lean definition. The Lean project and the test stay outside
// the package. This adds 7 payload bytes over the unchanged 596-file
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin
// arm64 were byte-identical at 11,993,659 packed bytes, 23,428,925 unpacked
// bytes; archive SHA-256
// 67bcf3f2bb56b7d9d7db7a902893528ed18823e888f553e4b78737b104fb6d09. Carry the
// same projections and allowances: 11,993,659 + 12,387 + 4,096 = 12,010,142
// packed; 23,428,925 + 353 + 65 = 23,429,343 unpacked.
// The messaging Quint replay moves crash recovery's terminalizing event out of
// runtime.ts into an exported messagingRecoveryEvent in
// messaging-action-store.ts, so the replay drives the same production function
// that recovery calls. The Quint models and their replay tests stay outside
// the package. This adds 371 payload bytes over the unchanged 596-file
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin
// arm64 were byte-identical at 11,993,735 packed bytes, 23,429,296 unpacked
// bytes; archive SHA-256
// 367705dc28b1778d1cf5d6359b18fbd14980e67b91335515ae7308e0b8032685. Carry the
// same projections and allowances: 11,993,735 + 12,387 + 4,096 = 12,010,218
// packed; 23,429,296 + 353 + 65 = 23,429,714 unpacked.
// Removal of ambiguous historical session secrets by their envelope's named
// owner, and the faster strict canonical JSON encoder, change
// src/session-secrets.ts, src/canonical-json.ts, and the rebuilt dist chunks
// that bundle the encoder. This adds 2,096 payload bytes over the unchanged
// 596-file inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on
// darwin arm64 were byte-identical at 11,994,505 packed bytes, 23,431,392
// unpacked bytes; archive SHA-256
// bc193f99425865e22f6527ed41d918c41259491d01b77c1225196f6156dd713a. Carry the
// same projections and allowances: 11,994,505 + 12,387 + 4,096 = 12,010,988
// packed; 23,431,392 + 353 + 65 = 23,431,810 unpacked.
// The media follow-ups kill every active media process group when Ghostget
// exits or receives an unhandled SIGINT, SIGTERM, or SIGHUP that it did not
// inherit as ignored, add the read-only `ghostget media quarantine` listing,
// and add an F_FULLFSYNC probe for the macOS durability check. This adds
// 15,207 payload bytes over the unchanged 596-file inventory. Two `npm pack
// --ignore-scripts` runs with npm 11.19.0 on darwin arm64 were byte-identical
// at 11,998,003 packed bytes, 23,446,599 unpacked bytes; archive SHA-256
// 202f2c9de0a07a44439e36b8448cd6d194ac7fd8f5f4d9c1f7bbfa7918c0bb10. Carry the
// same projections and allowances: 11,998,003 + 12,387 + 4,096 = 12,014,486
// packed; 23,446,599 + 353 + 65 = 23,447,017 unpacked.
// The cache-read and omni-materialization auth checks read the auth
// incarnation through the read capability instead of creating a missing one.
// This adds 637 payload bytes over the unchanged 596-file inventory. Two `npm
// pack --ignore-scripts` runs with npm 11.19.0 on darwin arm64 were
// byte-identical at 11,998,420 packed bytes, 23,447,236 unpacked bytes;
// archive SHA-256
// 6b1701acb53e452e8ada70e02c2f497535a7fdae32276cbd015723f2f817680d. Carry the
// same projections and allowances: 11,998,420 + 12,387 + 4,096 = 12,014,903
// packed; 23,447,236 + 353 + 65 = 23,447,654 unpacked.
// The path helper detects a live claim that a helper from before the reaper
// election moved into a recovery quarantine, fails closed, and keeps that
// quarantine through the residue sweep; the state helper exports its claim
// listing and stage decision for the state-claim Quint replay. The model and
// its replay test stay outside the package. This adds 3,823 payload bytes over
// the unchanged 596-file inventory. Two `npm pack --ignore-scripts` runs with
// npm 11.19.0 on darwin arm64 were byte-identical at 11,999,852 packed bytes,
// 23,451,059 unpacked bytes; archive SHA-256
// c38d1f9522d477a42a82d934359012ba31124f98348302b3b5c3fe97bac6709e. Carry the
// same projections and allowances: 11,999,852 + 12,387 + 4,096 = 12,016,335
// packed; 23,451,059 + 353 + 65 = 23,451,477 unpacked.
// The intent-fence follow-ups add the read-only doctor readback of intent
// claims, including claims off their intent's chain of fulfilled generations,
// record the provider subject in encrypted recovery capsules, and let
// reconciliation and duplicate-risk successor election continue across a
// same-subject reconnect. This adds 11,136 payload bytes over the unchanged
// 596-file inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0
// on darwin arm64 were byte-identical at 12,003,367 packed bytes, 23,462,195
// unpacked bytes; archive SHA-256
// 511abcac8f9316451689f3881ef403d2fa2284f91dda1e9a31048dfdf5f612b2. Carry the
// same projections and allowances: 12,003,367 + 12,387 + 4,096 = 12,019,850
// packed; 23,462,195 + 353 + 65 = 23,462,613 unpacked.
// Read-path invocation preparation, confirmation preparation, and the
// operation-permission account identity bind the auth incarnation through the
// read capability instead of creating a missing one, and the omni view's
// closing recheck reports a source whose incarnation disappeared as changed.
// This adds 4,655 payload bytes over the unchanged 596-file inventory. Two
// `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin arm64 were
// byte-identical at 12,004,806 packed bytes, 23,466,850 unpacked bytes;
// archive SHA-256
// 0b212ac291218528dcf979370110a36f10850e046ca90a536057d9a44e807d1d. Carry the
// same projections and allowances: 12,004,806 + 12,387 + 4,096 = 12,021,289
// packed; 23,466,850 + 353 + 65 = 23,467,268 unpacked.
// Remeasured after merging #375 into the fence-model branch: the branch
// exports acquireConfirmedWriteLedgers and confirmedWriteLedgerPath from
// src/runtime.ts and src/confirmed-write-platform.ts without changing
// behaviour. This adds 575 payload bytes over the unchanged 596-file
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin
// arm64 were byte-identical at 12,004,958 packed bytes, 23,467,425 unpacked
// bytes; archive SHA-256
// d00e25fa513d0d5bfcbdf8fa407d82b99641164f976ddd913f741a156c25a8c1. Carry the
// same projections and allowances: 12,004,958 + 12,387 + 4,096 = 12,021,441
// packed; 23,467,425 + 353 + 65 = 23,467,843 unpacked.
// Remeasured for the release and publication claims branch: package.json's
// test:npm-release script now also runs the Release provider outcome, publisher
// model, App-token revocation, and npm rerun model tests, so the shipped
// package.json grows. This adds 173 payload bytes over the unchanged 596-file
// inventory. Two `npm pack --ignore-scripts` runs with npm 11.19.0 on darwin
// arm64 were byte-identical at 12,005,010 packed bytes, 23,467,598 unpacked
// bytes; archive SHA-256
// 0db7a4879c287a20cadee309286755cdcfb00a6d67112f75c2cbcc827b809250. Carry the
// same projections and allowances: 12,005,010 + 12,387 + 4,096 = 12,021,493
// packed; 23,467,598 + 353 + 65 = 23,468,016 unpacked.
//
// The control, auth, and provider-control claims add the public-address
// classification and vectors, pinned HTTPS protections, helper ownership and
// shutdown models, and operation permission changes. The first measurement
// missed `src/public-address.ts` in the package file list, which the packed
// smoke caught when the installed CLI could not resolve the import; with it
// shipped, the branch measured 12,008,738 packed bytes and 23,477,699
// unpacked bytes across its 597-file inventory.
//
// The portable retained readback and successor handling add the portable
// provider host/runtime support, the retained readback and supersession
// cores, and their tests, the public-address classification and vectors, and
// the subject-keyed confirmed-write fence's authSubject, cross-locator scan,
// and post-claim recheck. The planned-claims lane's shared `hasExactKeys`
// import made the two entry graphs share `contracts-shape`, so the split
// `dist` build gains one chunk. A clean `npm pack --ignore-scripts` with npm
// 11.19.0 on darwin arm64 measured 12,020,614 packed bytes and 23,535,472
// unpacked bytes across the 598-file inventory; archive SHA-256
// fa943b53e54759afa7c9af3045e194cbe66ac66a9a1200337216d52f8943d9cb.
// Carry the same projections and allowances: 12,020,614 + 12,387 + 4,096 =
// 12,037,097 packed; 23,535,472 + 353 + 65 = 23,535,890 unpacked.
// The batched-poll follow-up adds the host pollEnrollments/readScopePages
// path, the server pollSet dispatch and multi-plan asset tracking, the
// provider FIFO queues, factory custody refcounting, and the iMessage
// eventsScoped helper plus tests; the rebuilt automation chunk keeps the
// same 598-file inventory. Review repairs then forwarded eventsScoped
// through the factory wrapper, degraded group and per-enrollment faults to
// per-item results, closed the custody teardown admission window, hoisted
// the busy-row lookup, made the call refcount decrement unconditional, and
// scaled the scoped-read deadline. A clean `npm pack --ignore-scripts` with
// npm 11.16.0 on darwin arm64 measured 12,037,924 packed bytes and
// 23,557,354 unpacked bytes; archive SHA-256
// d7ffa146b6948b24fa27556c8897561f8c234039c3b11957d229f2e81d4b879b.
// Carry the same projections and allowances: 12,037,924 + 12,387 + 4,096 =
// 12,054,407 packed; 23,557,354 + 353 + 65 = 23,557,772 unpacked.
// The release source-CI admission repair admits the current four-language
// CodeQL matrix (actions, javascript-typescript, python, rust) instead of
// the stale two-language contract, updates its fixtures, and carries the
// 0.18.37 version bump across package.json, CHANGELOG.md, and the
// regenerated dist bundles over the same 598-file inventory. A clean
// `npm pack --ignore-scripts` with npm 11.16.0 on darwin arm64 measured
// 12,038,177 packed bytes and 23,557,921 unpacked bytes; archive SHA-256
// ed90b463e90de04a24c08eb2346c738a792d0b3be178ed263673ead86713cd9b.
// Carry the same projections and allowances: 12,038,177 + 12,387 + 4,096 =
// 12,054,660 packed; 23,557,921 + 353 + 65 = 23,558,339 unpacked.
// The moved-main release-source admission adds the provider-tree proof for
// merges whose parent advanced past the reviewed branch point, its fixtures
// and tests, and the 0.18.38 version bump across package.json,
// CHANGELOG.md, and the regenerated dist bundles over the same 598-file
// inventory. A clean `npm pack --ignore-scripts` with npm 11.16.0 on darwin
// arm64 measured 12,038,377 packed bytes and 23,558,518 unpacked bytes;
// archive SHA-256
// 34055b94c3b432755cbf9790246e2fd5870479c6302413c3ea56745924bc1f64.
// Carry the same projections and allowances: 12,038,377 + 12,387 + 4,096 =
// 12,054,860 packed; 23,558,518 + 353 + 65 = 23,558,936 unpacked.
// The release page change rewrites the shipped CHANGELOG.md 0.18.38 section
// as the summary and changes that the release workflow copies onto the
// GitHub Release page; the dist bundles and the 598-file inventory are
// unchanged. A clean `npm pack --ignore-scripts` with npm 11.19.0 (the
// version CI and the release workflow pin) on darwin arm64 measured
// 12,026,837 packed bytes and 23,560,532 unpacked bytes; archive SHA-256
// 965bb06d1a290dc830bc9aa40c59dbd7b1ad3957b00e9afa15e04ac561bff6db. The
// unchanged base measured 12,026,168 packed and 23,558,518 unpacked bytes
// with the same npm, so the change adds 669 packed and 2,014 unpacked bytes.
// Carry the same projections and allowances: 12,026,837 + 12,387 + 4,096 =
// 12,043,320 packed; 23,560,532 + 353 + 65 = 23,560,950 unpacked.
// The run-intent arbitration change adds the run.by-intent host query and
// scoped admission for every enrollment read, extends the plan window, and
// carries its regression tests plus the regenerated dist chunk over the same
// 598-file inventory. A clean `npm pack --ignore-scripts` with npm 11.19.0 on
// darwin arm64 measured 12,039,276 packed bytes and 23,561,480 unpacked
// bytes; archive SHA-256
// a6f33eb557bfe7b5521c3bb884075270cadb0b7935f41d2015952343ea3fcd32.
// Carry the same projections and allowances: 12,039,276 + 12,387 + 4,096 =
// 12,055,759 packed; 23,561,480 + 353 + 65 = 23,561,898 unpacked.
// Aggregate CLI run telemetry adds src/telemetry.ts and its bounded opt-out
// install-token wiring in the CLI entrypoint: one new packed source file and
// its rebuilt chunks over the merged base, 599 files total. A clean
// `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64 measured
// 12,028,110 packed bytes and 23,565,669 unpacked bytes; archive SHA-256
// 2ecb6cc258f61709554ca37f66fb58a2cd00ccb1157850fb6d200962127dbe24. Carry
// the same projections and allowances: 12,028,110 + 12,387 + 4,096 =
// 12,044,593 packed; 23,565,669 + 353 + 65 = 23,566,087 unpacked. Required
// Linux CI and canonical Release must independently measure and admit their
// exact archives.
// The 0.18.39 release bump carries the version pin across package.json,
// src/version.ts, the rebuilt dist bundles, docs and skills, the 0.18.39
// CHANGELOG section, and the release-page standard over the merged 600-file
// inventory (grouped CLI help added src/cli-style.ts).
// A clean `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64
// measured 12,044,402 packed bytes and 23,580,088 unpacked bytes; archive
// SHA-256 7b7e8e9feda9e61ca4e6f426b5b68e674102a37143ebbe39da8a24d0138a68af.
// Carry the same projections and allowances: 12,044,402 + 12,387 + 4,096 =
// 12,060,885 packed; 23,580,088 + 353 + 65 = 23,580,506 unpacked. Required
// Linux CI and canonical Release must independently measure and admit their
// exact archives.
//
// Browser permission notices add the cookie access modules
// (src/cookie-access.ts, src/cookie-access-error.ts), the permission-denied
// read failure and its rebuilt dist dispositions, Safari Full Disk Access
// detection, skill guidance and their changelog entry over the 0.18.39
// release tree: two additional packed source files.
// A clean `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64
// measured 12,053,623 packed bytes, 23,605,152 unpacked bytes and exactly
// 602 entries; archive SHA-256
// 873cad8139fda303e2d19c6afd61cf549cf9b4d1d76b2a1d6d632a6afe6bd0d1.
// Carry the same projections and allowances: 12,053,623 + 12,387 + 4,096 =
// 12,070,106 packed; 23,605,152 + 353 + 65 = 23,605,570 unpacked.
//
// Plain auth output adds src/auth-output.ts for the auth add, bind and list
// result lines, aligned rows, OAuth token state and Next: hints, plus their
// changelog entry: one additional packed source file.
// A clean `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64
// measured 12,057,881 packed bytes, 23,616,655 unpacked bytes and exactly
// 603 entries; archive SHA-256
// 0c331bab3ab3df69a108e18f5f29845b0db90c281cbd6455c0d90fa0b24081e2.
// Carry the same projections and allowances: 12,057,881 + 12,387 + 4,096 =
// 12,074,364 packed; 23,616,655 + 353 + 65 = 23,617,073 unpacked.
//
// The 0.18.40 release bumps the version pins, rebuilds dist with the new
// version string and adds the changelog section over the same 603-file
// inventory.
// A clean `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64
// measured 12,057,961 packed bytes, 23,616,964 unpacked bytes and exactly
// 603 entries; archive SHA-256
// aa127b3193c9bb3b0cb5deece5927be60ccb7111a50169320d322ffdeaa13f39.
// Carry the same projections and allowances: 12,057,961 + 12,387 + 4,096 =
// 12,074,444 packed; 23,616,964 + 353 + 65 = 23,617,382 unpacked.
//
// Quiet keychain notices add src/keychain-notice-record.ts (the per-browser
// record of keychain reads macOS allowed without asking) plus typed Edge,
// VS Code-fork and plugin permission denials: one additional packed source
// file.
// A clean `npm pack --ignore-scripts` with npm 11.19.0 on darwin arm64
// measured 12,061,280 packed bytes, 23,627,901 unpacked bytes and exactly
// 604 entries; archive SHA-256
// 7e93bffa218491dbe4f78c0733fd4964df6437d734cf767e4ed0b3ebb11563fe.
// Carry the same projections and allowances: 12,061,280 + 12,387 + 4,096 =
// 12,077,763 packed; 23,627,901 + 353 + 65 = 23,628,319 unpacked.
// The CLI spot checks add the version product name, the --json error
// envelope and the empty auth list's inline next step: a clean npm 11.16.0
// pack --ignore-scripts on this branch measured 604 entries, 12,061,823
// packed bytes and 23,629,960 unpacked bytes; archive SHA-256
// e30b97c08fc757579c1fa5f35d3b1fa283680f04cc59b4ffc7d30aa9c848ec04.
// The repair-lead inspect pointer and the JSON-envelope error fallback in
// the SDK identity-preflight path added 582 payload bytes: a clean npm
// 11.16.0 pack --ignore-scripts on this branch measured 604 entries,
// 12,062,006 packed bytes and 23,630,542 unpacked bytes; archive SHA-256
// 3f7ad946cb5ab4f5fcc85b9177ac271734da09ce7e16cf6e157910c4ce48e950.
// Merged with the help-advanced agent-verb move: a clean npm 11.16.0 pack
// --ignore-scripts on the merged tree measured 604 entries, 12,062,352
// packed bytes and 23,631,919 unpacked bytes; archive SHA-256
// d1cf2859e7c9c9f479c75473cbba27390f7fc23f72106f54549e08917cbac1a8.
// Menu action error rows over the desktop-foundation v0.8.0 bump (menu
// protocol v2 surface, MenuActionError, actionErrorItem, lintMenu) merged
// with the help-advanced agent-verb move: a clean npm 11.16.0 pack
// --ignore-scripts on the merged tree measured 604 entries, 12,062,831
// packed bytes and 23,633,266 unpacked bytes; archive SHA-256
// a091637d0a6df2ce09e14d0f2c4ebc5ef3b8b7d138c07625950ddf050ce3b30c.
// Carry the same projections and allowances: 12,062,831 + 12,387 + 4,096 =
// 12,079,314 packed; 23,633,266 + 353 + 65 = 23,633,684 unpacked.
//
// CLI spot checks over the merged menu-errors and help-advanced tree:
// a clean npm 11.16.0 pack --ignore-scripts on the merged tree measured
// 604 entries, 12,063,675 packed bytes and 23,637,017
// unpacked bytes; archive SHA-256 d92454b503fcab94cd6519cf63350ca043071657f40a0887e1ad0ffd8a80495c.
// The rebuilt dist/client.js carries the merged client error-envelope
// handling; darwin and Linux measure identical payload bytes for it.
// Carry the same projections and allowances: 12,063,675 + 12,387 + 4,096 =
// 12,080,158 packed; 23,637,017 + 353 + 65 = 23,637,435
// unpacked.
//
// The GG-8 signed-helper cookie path adds src/cookie-safe-storage.ts,
// src/cookie-chromium-mac.ts and the spawned src/cookie-companion-resolve.ts
// resolver beside the local-custody 0.9.0 pin: a clean npm 11.16.0 pack
// --ignore-scripts on this branch measured 607 entries, 12,069,104 packed
// bytes and 23,660,010 unpacked bytes; archive SHA-256
// 9f8f589ce2465c95c5cbc566617730cd18a77aaeb446166bcaf4d27fdad6d295.
// Carry the same projections and allowances: 12,069,104 + 12,387 + 4,096 =
// 12,085,587 packed; 23,660,010 + 353 + 65 = 23,660,428 unpacked.
//
// Menu kit v2 with account handles and Safari Full Disk Access rows merged
// with the GG-8 signed-helper cookie path over local-custody 0.9.0: a clean
// npm 11.16.0 pack --ignore-scripts on the merged tree measured 607 entries,
// 12,074,301 packed bytes and 23,682,116 unpacked bytes; archive SHA-256
// db66d32223767fbb8fb716b360d571d2e09b72800d043fdb7e06a3e894156956.
// Carry the same projections and allowances: 12,074,301 + 12,387 + 4,096 =
// 12,090,784 packed; 23,682,116 + 353 + 65 = 23,682,534 unpacked.
//
// The 0.18.41 release then bumped the version pins and rebuilt dist: a
// clean npm 11.19.0 pack --ignore-scripts on main measured 607 entries,
// 12,069,502 packed bytes and 23,661,362 unpacked bytes; archive SHA-256
// ef2baf9604502635dc466ce3ca77e902588e3db0fa35c4ddfdec2c0f53393913.
// Carry the same projections and allowances: 12,069,502 + 12,387 + 4,096 =
// 12,085,985 packed; 23,661,362 + 353 + 65 = 23,661,780 unpacked.
//
// Menu kit v2 remeasured over the released 0.18.41 tree: a clean
// npm 11.19.0 pack --ignore-scripts on the merged tree measured 607
// entries, 12,074,874 packed bytes and 23,683,488 unpacked bytes; archive
// SHA-256 acd85cbe3e5f7579e0c9ae61bcd81d5894ffb62f2df306bd69dd367ba0028cef.
// Carry the same projections and allowances: 12,074,874 + 12,387 + 4,096 =
// 12,091,357 packed; 23,683,488 + 353 + 65 = 23,683,906 unpacked.
//
// CLI spot checks remeasured over the released 0.18.41 tree: a clean
// npm 11.19.0 pack --ignore-scripts on the merged tree measured 607
// entries, 12,070,406 packed bytes and 23,665,113 unpacked bytes; archive
// SHA-256 e6609563d5b9825a38a503be4e2e99060685e041e62731acc56783cee6b678a2.
// Carry the same projections and allowances: 12,070,406 + 12,387 + 4,096 =
// 12,086,889 packed; 23,665,113 + 353 + 65 = 23,665,531 unpacked.
//
// Menu kit v2 remeasured over 0.18.41 plus the merged CLI spot checks: a
// clean npm 11.19.0 pack --ignore-scripts on the merged tree measured 607
// entries, 12,076,120 packed bytes and 23,687,219 unpacked bytes; archive
// SHA-256 bb19515b7f9c733821bbc065bd27d140e7f93eaf20ec0de51b34dc595fa4a4bf.
// Carry the same projections and allowances: 12,076,120 + 12,387 + 4,096 =
// 12,092,603 packed; 23,687,219 + 353 + 65 = 23,687,637 unpacked.
//
// The 0.18.42 release bumps the version pins and rebuilds dist over that
// merged tree: a clean npm 11.19.0 pack --ignore-scripts measured 607
// entries, 12,076,471 packed bytes and 23,688,039 unpacked bytes; archive
// SHA-256 7d802459a02adad63157c416bcc35158de2ccb1f3d003814006c351ebd46aa00.
// Carry the same projections and allowances: 12,076,471 + 12,387 + 4,096 =
// 12,092,954 packed; 23,688,039 + 353 + 65 = 23,688,457 unpacked.
//
// The release merge to main crossed two concurrent merges — the aggregate
// CLI command-family ping (#426) and the site-footer v0.19.3 devDependency
// bump (#428) — so dist is rebuilt from the merged source and the archive
// is remeasured on the integrated tree: a clean npm 11.19.0 pack
// --ignore-scripts measured 607 entries, 12,076,551 packed bytes and
// 23,688,277 unpacked bytes; archive SHA-256
// dafd7278b23253fb61ea563156b6fb50a48c27e09466b05851fa3c6360c658ec.
// Carry the same projections and allowances: 12,076,551 + 12,387 + 4,096 =
// 12,093,034 packed; 23,688,277 + 353 + 65 = 23,688,695 unpacked.
//
// The capture-required Substack subscriber operations add the retained
// substack-web 1.7.0 adapter snapshot and the substack-subscribers skill
// reference over that integrated main tree: two additional packed files. A
// clean npm 11.19.0 pack --ignore-scripts on darwin arm64 measured 609
// entries, 12,089,062 packed bytes and 23,758,825 unpacked bytes; archive
// SHA-256 de75b0b81bf098fa08171d8bdf9c3a0798db74027652b777f6d2883c8b143c97.
// Carry the same projections and allowances: 12,089,062 + 12,387 + 4,096 =
// 12,105,545 packed; 23,758,825 + 353 + 65 = 23,759,243 unpacked.
//
// The 0.18.43 release bumps the version pins, adds its changelog section and
// rebuilds dist over the integrated main tree that carries the Substack
// operations and the ghostget.com polish (website only, not packed). A clean
// npm 11.19.0 pack --ignore-scripts with Node 24.20.0 on darwin arm64
// measured 609 entries, 12,077,310 packed bytes and 23,759,283 unpacked
// bytes; archive SHA-256
// 0fa290c4dbb3963c0d1f63c16c2bac584273c1dece30f3a4052244a701985187.
// Carry the same projections and allowances: 12,077,310 + 12,387 + 4,096 =
// 12,093,793 packed; 23,759,283 + 353 + 65 = 23,759,701 unpacked.
// The messaging-automation permission snapshot describes a status report's
// action kinds from one admitted snapshot, and a dispatch reuses its own
// poll's provider inspection: a small amount of added source and one rebuilt
// dist chunk in the same 609 packed files. After `bun run build`, a clean npm
// 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64 measured 609
// entries, 12,090,401 packed bytes and 23,763,115 unpacked bytes; archive SHA-256
// bf77d04ec6cd5ccffbb7390880f423849b6be84066a3ca66da00bf40d1c767c0.
// Carry the same projections and allowances: 12,090,401 + 12,387 + 4,096 =
// 12,106,884 packed; 23,763,115 + 353 + 65 = 23,763,533 unpacked.
//
// The disabled Microsoft Graph contacts/calendar candidate adds six shipped
// files over merged main 93a80a6 (0.18.43 plus permission snapshot): adapter, plugin, contracts,
// runtime, policy, and public reference. A clean npm 11.19.0 pack
// --ignore-scripts with Node 24.18.1 on darwin arm64 measured 615 entries,
// 12,099,048 packed bytes and 23,798,398 unpacked bytes; archive SHA-256
// 0f0aa0a6313132ac00477496792563879b902c16b786d86d88ae74843c93afed.
// Retain the same platform projections and portability allowances:
// 12,099,048 + 12,387 + 4,096 = 12,115,531 packed;
// 23,798,398 + 353 + 65 = 23,798,816 unpacked.
//
// The persistent automation helpers add the iMessage automation session, the
// synchronous persistent state-helper bridge, the state helper's serve mode and
// rebuilt dist chunks, and ships the bridge as one new packed file. After
// `bun run build`, a clean npm 11.19.0 pack --ignore-scripts with Node 24.18.1
// on darwin arm64 measured 616 entries, 12,109,347 packed bytes and 23,840,831
// unpacked bytes; archive SHA-256
// cb84d130337d9f5efb520d78592c0047b67c75de2a1677633bea25064a06e46b.
// Carry the same projections and allowances: 12,109,347 + 12,387 + 4,096 =
// 12,125,830 packed; 23,840,831 + 353 + 65 = 23,841,249 unpacked.
//
// The disabled Substack subscriber export v2 candidate over merged main
// 9f2dd16 adds the retained 1.8.0 adapter snapshot and updates the bounded
// parser, account/publication binding, encrypted pagination, contract identity,
// and reference: one additional packed file. After `bun run build`, a clean
// npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64 measured
// 616 entries, 12,104,883 packed bytes and 23,845,115 unpacked bytes; archive
// SHA-256 90ef33da70559db4674510c401466fe74a240967f8d719a4cfb3f9e012af4227.
// Retain the same platform projections and portability allowances:
// 12,104,883 + 12,387 + 4,096 = 12,121,366 packed;
// 23,845,115 + 353 + 65 = 23,845,533 unpacked.
//
// The disabled Substack subscriber export v2 candidate over merged main
// 31ef3fd combines the retained 1.8.0 adapter snapshot and export updates with
// the persistent helper bridge: 617 packed files. After `bun run build`, a
// clean npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64
// measured 12,116,353 packed bytes and 23,887,548 unpacked bytes; archive
// SHA-256 00ead58f3e0268855e0face59da2460faa723c68c18e19542c37fd891cd4431f.
// Retain the same platform projections and portability allowances:
// 12,116,353 + 12,387 + 4,096 = 12,132,836 packed;
// 23,887,548 + 353 + 65 = 23,887,966 unpacked.
//
// The qualified Substack subscriber reads and one-address import over
// main 4084ff5 add the retained 1.9.0 adapter snapshot as one new packed file
// and grow the subscriber parser, runtime, adapter, plugin, and reference.
// After `bun run build`, a clean npm 11.19.0 pack --ignore-scripts with Node
// 24.18.1 on darwin arm64 measured 618 entries, 12,122,080 packed bytes and
// 23,930,250 unpacked bytes; archive SHA-256
// a3aed9af22331dba7333d6705ca83ac4d4cd2343ab084267086f7ce53d5d258e.
// Retain the same platform projections and portability allowances:
// 12,122,080 + 12,387 + 4,096 = 12,138,563 packed;
// 23,930,250 + 353 + 65 = 23,930,668 unpacked.
// The 0.18.44 release bumps the version pins, adds its changelog section and
// rebuilds dist over merged main 8d14662. After `bun run build`, a clean npm
// 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64 measured
// 618 entries, 12,122,574 packed bytes and 23,931,644 unpacked bytes; archive
// SHA-256
// 7a0cc5855e8fbe6a1632195c6b85356df29a0ab4bd8a3719324aae9c70562d71.
// Carry the same projections and allowances: 12,122,574 + 12,387 + 4,096 =
// 12,139,057 packed; 23,931,644 + 353 + 65 = 23,932,062 unpacked.
//
// The read-only dated messaging history window over main 53a1592 adds the
// `history.window` host method, iMessage start/end forwarding, and explicit
// WhatsApp and Beeper refusals without new packed files. After `bun run build`,
// a clean npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64
// measured 618 entries, 12,124,686 packed bytes and 23,937,025 unpacked bytes;
// archive SHA-256
// 91073eb4b08aa5900ce3d8becc42d4a539fb278dd2fece5da50b7116def2ce3f.
// Carry the same projections and allowances: 12,124,686 + 12,387 + 4,096 =
// 12,141,169 packed; 23,937,025 + 353 + 65 = 23,937,443 unpacked.
//
// The 0.18.44 release notes add the dated history window and the homepage
// update to the changelog section over main ea6e99b; no source or dist file
// changes. After `bun run build`, a clean npm 11.19.0 pack --ignore-scripts
// with Node 24.18.1 on darwin arm64 measured 618 entries, 12,124,890 packed bytes
// and 23,937,545 unpacked bytes; archive SHA-256
// 4eb676361817c0088f3f3671999528b9726a8ea6b59145797408c37ebc5ac150.
// Carry the same projections and allowances: 12,124,890 + 12,387 + 4,096 =
// 12,141,373 packed; 23,937,545 + 353 + 65 = 23,937,963 unpacked.
//
// Moving the runtime dependency from @hraness/kb 0.19.6 to the immutable
// Wordcell 0.24.0 release archive over the merged 0.18.44 main renames
// every clip import specifier, grows the smoke and registry review pins
// to cover the dependency's now-split dynamic-resolution modules, and
// rebuilds the packed dist chunks. After `bun run build`, a clean
// npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64
// measured 618 entries, 12,125,239 packed bytes, and 23,939,528 unpacked
// bytes; archive SHA-256
// 81b82626d55fcc0ef960ac59c3dfc0e90ed6417756d614b00796d5c4122b5072.
// Retain the same platform projections and allowances:
// 12,125,239 + 12,387 + 4,096 = 12,141,722 packed;
// 23,939,528 + 353 + 65 = 23,939,946 unpacked.
//
// Strict packaged-source compatibility for `erasableSyntaxOnly`
// consumers removes the remaining constructor parameter property from
// src/cookie-safe-storage.ts, keeps the persistent-helper environment
// typed with literal NODE_ENV values so narrowed consumer ProcessEnv
// unions still admit it, builds RequestInit bodies without explicit
// undefined under exactOptionalPropertyTypes, teaches the package smoke
// to compile the packed public entrypoints with the strict consumer
// flags, and repins @hraness/local-custody to the immutable 0.9.1
// release archive: three changed packed sources plus their rebuilt
// bundles over the unchanged 618-file inventory. After `bun run build`,
// a clean npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin
// arm64 measured 618 entries, 12,125,748 packed bytes, and 23,940,758
// unpacked bytes; archive SHA-256
// d5681ab13f0bc005bcd4bbf4b18152de887c062e7e8be3d0ecc28f14e11177d5.
// Retain the same platform projections and allowances:
// 12,125,748 + 12,387 + 4,096 = 12,142,231 packed;
// 23,940,758 + 353 + 65 = 23,941,176 unpacked.
//
// The 0.18.45 release bumps the version pins, adds its changelog section
// over merged main 2ed33bb, and rebuilds the version chunk; no other
// source or adapter file changes. After `bun run build`, a clean
// npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin arm64
// measured 618 entries, 12,125,761 packed bytes, and 23,940,938
// unpacked bytes; archive SHA-256
// 0d6a1de00fd825d700b1ed0505b6fa34992f11d1deb42a5c255f7cfc295eedbc.
// Retain the same platform projections and allowances:
// 12,125,761 + 12,387 + 4,096 = 12,142,244 packed;
// 23,940,938 + 353 + 65 = 23,941,356 unpacked.
//
// The 0.18.46 release carries the `ghostget` support handoff id (#450),
// bumps the version pins, adds its changelog section over merged main
// 95c6a2c, and rebuilds the version chunk; no adapter file changes. After
// `bun run build`, a clean npm 11.19.0 pack --ignore-scripts with Node
// 24.18.1 on darwin arm64 measured 618 entries, 12,125,923 packed bytes,
// and 23,941,366 unpacked bytes; archive SHA-256
// 25cfe9120e4cf43087a79e5bf302cb0683719a7db8267ed97503e75da5883185.
// Retain the same platform projections and allowances:
// 12,125,923 + 12,387 + 4,096 = 12,142,406 packed;
// 23,941,366 + 353 + 65 = 23,941,784 unpacked.
//
// The README gains a "When to use something else" table that links the
// comparison hub and corrects the hero image alt text: 1,018 README bytes
// over main d426704 and no other packed file changes. After `bun run build`,
// a clean npm 11.19.0 pack --ignore-scripts with Node 24.18.1 on darwin
// arm64 measured 618 entries, 12,126,287 packed bytes, and 23,942,384
// unpacked bytes (exactly 23,941,366 + 1,018); archive SHA-256
// 785b8fa60c329d7ac46bc8fcf4d959b5fa9d96455bba9e7cdea63f6a3827c4f6.
// Retain the same platform projections and allowances:
// 12,126,287 + 12,387 + 4,096 = 12,142,770 packed;
// 23,942,384 + 353 + 65 = 23,942,802 unpacked.
//
// The X contacts.list qualification adds the viewer-bound Following and
// Followers GraphQL collection reads, the TimelineUser normalizer, the
// contacts page projection on the shared directional-statistics shape, the
// archived x-web 1.14.0 adapter snapshot, and the qualification record over
// merged main 46e31838 (Ghostget 0.18.46 plus the README alternatives
// table). Registering the new archive snapshot in the package manifest
// grows the inventory to 619 entries: a clean npm 11.16.0 pack
// --ignore-scripts with Node 24.18.1 on darwin arm64 measured 12,132,235
// packed bytes and 23,980,585 unpacked bytes; archive SHA-256
// 9641f93ab7dd2c52174cf2ddf3e41f407ebca562c46e0dd0af2e6cd01447c2de.
// Retain the same platform projections and portability allowances:
// 12,132,235 + 12,387 + 4,096 = 12,148,718 packed;
// 23,980,585 + 353 + 65 = 23,981,003 unpacked.
//
// Signed-in `ghostget pdf <url>` downloads add src/pdf-auth.ts to the packed
// source and a lazy import from cli.ts; no dist chunk changes. Over merged
// main 65944e7 (which carries the X contacts.list snapshot above), the new
// source file grows the inventory to 620 entries. After `bun run build`, a
// clean npm 11.19.0 pack --ignore-scripts with Node 24.20.0 on darwin arm64
// measured 620 entries, 12,133,122 packed bytes, and 24,023,022 unpacked
// bytes; archive SHA-256
// e34c1d14165fdc4985280f7d56626bcd17055de9e2906bc9db1569807ed568ab.
// Retain the same platform projections and portability allowances:
// 12,133,122 + 12,387 + 4,096 = 12,149,605 packed;
// 24,023,022 + 353 + 65 = 24,023,440 unpacked.
//
// Release 0.18.47 over main 74544c9 changes only the version pins, the
// `## 0.18.47` changelog section, and the renamed version chunk. After
// `bun run build`, a clean npm 11.19.0 pack --ignore-scripts with Node 24.20.0
// on darwin arm64 measured 620 entries, 12,133,601 packed bytes, and
// 24,024,323 unpacked bytes; archive SHA-256
// 22c3be36b2f085591aefbc743d6717a5c56701481acef2fef2143a36ccc61309.
// Retain the same platform projections and portability allowances:
// 12,133,601 + 12,387 + 4,096 = 12,150,084 packed;
// 24,024,323 + 353 + 65 = 24,024,741 unpacked.
//
// Release 0.18.48 over main 9689dd4 changes the version pins, changelog,
// and renamed version chunk. After `bun run build`, npm 11.19.0
// pack --ignore-scripts with Node 24.20.0 on darwin arm64 measured
// 620 entries, 12,133,689 packed bytes, and 24,024,488 unpacked bytes;
// archive SHA-256
// 823baf88bde9e8436e1ce9c08116be355195c2a980003fb293699a1dd8d39678.
// Retain the same platform projections and portability allowances:
// 12,133,689 + 12,387 + 4,096 = 12,150,172 packed;
// 24,024,488 + 353 + 65 = 24,024,906 unpacked.
//
// Release 0.18.49 over main cf63f0a changes the version pins and changelog;
// the product-footer renderer remains outside the package archive. After
// `bun run build`, npm 11.19.0 pack --ignore-scripts with Node 24.20.0 on
// darwin arm64 measured 620 entries, 12,133,765 packed bytes, and
// 24,024,705 unpacked bytes; archive SHA-256
// 2d3a2a7b776bc784fd00a00ecc205433ae33be634c2e18faf94aeaea9ed1c6d0.
// Preserve the existing platform projections and portability allowances:
// 12,133,765 + 12,387 + 4,096 = 12,150,248 packed;
// 24,024,705 + 353 + 65 = 24,025,123 unpacked.
// Release 0.18.50 over main 198f9e4 retains the metallic footer and the
// current release controls after the unpublished 0.18.49 request. A clean
// npm 11.19.0 pack --ignore-scripts on darwin arm64 measured 12,133,918
// packed bytes and 24,025,224 payload bytes across the unchanged 620 files.
// Archive SHA-256
// be18897395dd74b2da8a7d82c1827c740c4977090145e16c4f992addbf8e963d.
// Preserve the projections and allowances:
// 12,133,918 + 12,387 + 4,096 = 12,150,401 packed;
// 24,025,224 + 353 + 65 = 24,025,642 unpacked.
// Release 0.18.51 over main 460bdf0 changes release pins and the changelog;
// website forced-colors styles stay outside the published package. A clean
// npm 11.19.0 pack --ignore-scripts on darwin arm64 measured 620 files,
// 12,134,026 packed bytes and 24,025,465 unpacked bytes. Archive SHA-256
// 7a0dd28e5820275a980779d1eb957da7f16adc3ab13ca273d4ac15aedd29d9e6.
// Preserve all platform projections and portability allowances:
// 12,134,026 + 12,387 + 4,096 = 12,150,509 packed;
// 24,025,465 + 353 + 65 = 24,025,883 unpacked.
// Integrating main d1d89b8 preserves its GhostGet capitalization edits and
// reviewed PR-verification scoping. Rebuilt 0.18.51 measures 12,134,057 packed
// bytes and unchanged 24,025,465 payload bytes / 620 files. Archive SHA-256:
// 25865a89245a4d5663f4d4a4de18d0214ddb23e8d63db98fc6da15e8e497801b.
// Preserve allowances: 12,134,057 + 12,387 + 4,096 = 12,150,540 packed;
// 24,025,465 + 353 + 65 = 24,025,883 unpacked.
// Release 0.18.52 over main 6cb5711 changes release pins and the changelog;
// the web-discovery share-card upgrade stays outside the published package.
// A clean npm 11.19.0 pack --ignore-scripts with Node 24.20.0 (zlib 1.2.12)
// on darwin arm64 measured 620 files, 12,134,122 packed bytes and
// 24,025,660 unpacked bytes. Archive SHA-256
// 8c64bb2ed2c949f60b9b3c9887eb172de0b4a5076cc0d95e379aa873b436b5a6.
// Preserve all platform projections and portability allowances:
// 12,134,122 + 12,387 + 4,096 = 12,150,605 packed;
// 24,025,660 + 353 + 65 = 24,026,078 unpacked.
// The menu-bar retirement's release-N control surface over main 460bdf0 adds
// src/control/admin-socket.ts, outputs.ts, registry.ts, registry-words.ts
// and status-view.ts to the shipped control sources and grows the CLI,
// TUI, helper, usage, skill and changelog payloads. After `bun run build`,
// npm 11.19.0 pack --ignore-scripts with Node 24.20.0 on darwin arm64
// measured 625 entries, 12,151,310 packed bytes, and 24,090,676
// unpacked bytes; archive SHA-256
// d5861b503853758fc7939c664194717b066864004f89801ad86d85bde7a4f8eb.
// Preserve the projections and allowances:
// 12,151,310 + 12,387 + 4,096 = 12,167,793 packed;
// 24,090,676 + 353 + 65 = 24,091,094 unpacked.
// The same release N with `tui --snapshot` wrapped to --width (review fix)
// grows src/control/tui.ts, tui-model.ts and the changelog. After
// `bun run build`, npm 11.19.0 pack --ignore-scripts with Node 24.20.0 on
// darwin arm64 measured 625 entries, 12,152,234 packed bytes, and 24,093,014
// unpacked bytes; archive SHA-256
// 636e8e4c92e97e72b08090ac36acb11da0b2d4a3906bfbfd095d266ce4803a2f.
// Preserve the projections and allowances:
// 12,152,234 + 12,387 + 4,096 = 12,168,717 packed;
// 24,093,014 + 353 + 65 = 24,093,432 unpacked.
// Integrating main 7cca3ef (0.18.51, design-kit v0.29.2) into the same
// release N. After `bun run build`, npm 11.19.0 pack --ignore-scripts with
// Node 24.20.0 on darwin arm64 measured 625 entries, 12,152,401 packed bytes, and
// 24,093,255 unpacked bytes; archive SHA-256
// 59c8473107b13026150b8d8dd02b0b05831ccdf95d65d6f13a662d7c0a79e125.
// Preserve the projections and allowances:
// 12,152,401 + 12,387 + 4,096 = 12,168,884 packed;
// 24,093,255 + 353 + 65 = 24,093,673 unpacked.
// Integrating main 6622835 (0.18.52, web-discovery v0.11.0 share card) into
// the same release N. After `bun run build`, npm 11.19.0 pack --ignore-scripts
// with Node 24.20.0 on darwin arm64 measured 625 entries, 12,152,476 packed
// bytes, and 24,093,450 unpacked bytes; archive SHA-256
// 53163e785e34ab363fdf7e936f5b1cd9a61ca838700dfdd5d1b888ca6e9ce0dd.
// Preserve the projections and allowances:
// 12,152,476 + 12,387 + 4,096 = 12,168,959 packed;
// 24,093,450 + 353 + 65 = 24,093,868 unpacked.
// Release 0.18.53 over main dbbd1a5 (menu-bar retirement release N) moves
// the active version pins, the changelog and the renamed version chunk.
// After `bun run build`, npm 11.19.0 pack --ignore-scripts with Node 24.20.0
// on darwin arm64 measured 625 entries, 12,152,599 packed bytes, and
// 24,093,808 unpacked bytes; archive SHA-256
// 62c48e73e055555dd4efe9049af0d931381ff5ef21f8b789f3ddfb5aac2745e7,
// reproduced by a second pack. Preserve the projections and allowances:
// 12,152,599 + 12,387 + 4,096 = 12,169,082 packed;
// 24,093,808 + 353 + 65 = 24,094,226 unpacked.
export const repairPackageMeasurement = Object.freeze({
  scope: "Ghostget 0.18.53 release over main dbbd1a5",
  command: "npm pack --ignore-scripts",
  npmVersion: "11.19.0",
  platform: "darwin-arm64",
  archiveSha256: "62c48e73e055555dd4efe9049af0d931381ff5ef21f8b789f3ddfb5aac2745e7",
  packedBytes: 12_152_599,
  unpackedBytes: 24_093_808,
  entryCount: 625,
  packedPlatformProjection: 12_387,
  packedPortabilityAllowance: 4_096,
  payloadPlatformProjection: 353,
  payloadAllowance: 65,
});
export const MAX_PACKED_BYTES = repairPackageMeasurement.packedBytes
  + repairPackageMeasurement.packedPlatformProjection + repairPackageMeasurement.packedPortabilityAllowance;
export const MAX_PACKED_ENTRIES = repairPackageMeasurement.entryCount;
export const MAX_PACKED_FILES = repairPackageMeasurement.entryCount;
// The Ghostget 0.18.15 candidate measured 22,656,407 unpacked bytes; the
// ceiling carries the reviewed 65-byte allowance over that measurement.
//
// The RFC 8785 canonical-ordering migration adds the dual-read serializer
// and verification-path helpers plus their audit conversions across the
// canonical-JSON consumers: a clean npm 11.19.0 pack --ignore-scripts on
// this branch measured 22,674,601 unpacked bytes across the unchanged
// 564-file inventory. Retain the reviewed 65-byte allowance:
// 22,674,601 + 65 = 22,674,666. The schema-identity constants pinned to the
// legacy serializer (stable reviewed identifiers, not new writes) added 337
// source bytes: a clean pack now measures 22,674,938. Retain the reviewed
// 65-byte allowance: 22,674,938 + 65 = 22,675,003.
// The local-custody v0.6.0 release-asset pin replaces the 69-byte git-SHA
// spec with the 97-byte immutable release-tarball URL, adding exactly 28
// package.json payload bytes: a clean npm 11.19.0 pack --ignore-scripts on
// this branch measured 22,674,966 unpacked bytes across the unchanged
// 564-file inventory. Retain the existing ceiling; the residual allowance
// is now 37 bytes: 22,674,966 + 37 = 22,675,003.
// Consolidating the four contract stableJson serializers onto the shared
// canonicalJson encoder shrank source and rebuilt payload bytes: two npm
// 11.19.0 packs --ignore-scripts on this branch were byte-identical at
// 22,673,853 unpacked bytes across the unchanged 564-file inventory.
// Retain the existing ceiling; the residual allowance is now 1,150 bytes:
// 22,673,853 + 1,150 = 22,675,003.
//
// Staged local-custody sidecar adoption adds src/custody-engine.ts (+1,026)
// and grows the guard, boundary, helper, and semantic-identity sources plus
// rebuilt dist chunks by +2,476 payload bytes over the 22,674,938
// measurement: a clean npm 11.19.0 pack --ignore-scripts on this branch
// measured 22,677,414 unpacked bytes across the new 565-file inventory.
// Retain the reviewed 65-byte allowance: 22,677,414 + 65 = 22,677,479.
// The final consumer reference measurement retains the original allowance:
// 22,689,627 + 65 = 22,689,692.
// The 0.18.17 measurement restores that same allowance over the new source:
// 22,769,813 + 65 = 22,769,878.
// The browser-profile discovery measurement restores it again:
// 22,786,274 + 65 = 22,786,339.
// The bound-version realm repair adds the subject parts split plus the
// drift-repair and boundVersion provenance helpers to
// beeper-local-runtime, the boundVersion field to the linked-device auth
// record, and three internal tests: measured 23,219,374 unpacked bytes on
// the Linux package job, restoring the same 65-byte allowance.
// 23,219,374 + 65 = 23,219,439.
// The auth-repair-required signal adds the typed error class, its wiring
// through the bound-subject checks and the read envelope projection, and
// the accompanying tests: measured 23,220,534 unpacked bytes on the Linux
// package job, restoring the same 65-byte allowance.
// 23,220,534 + 65 = 23,220,599.
// The mid-read realm retry adds the LiveReadDiscardedError type and the
// bounded re-prepare to read-client plus its regression tests: measured
// 23,222,059 unpacked bytes, restoring the same 65-byte allowance.
// 23,222,059 + 65 = 23,222,124.
// The Instagram profile-page fallback adds the profile-html transport binding
// and the Open Graph fallback normalizer across meta-web, its runtime, the
// contained browser transport, and rebuilt dist chunks: a clean
// `bun pm pack --ignore-scripts` with Bun 1.3.14 on darwin arm64 measured
// exactly 589 files/entries and 23,229,987 payload bytes; archive SHA-256
// 7aaeba9a98900ed8083f4ec0a7d36d137cbc7585c1a5a676c8b092d7f3e486cb. Retain the
// reviewed 65-byte allowance: 23,229,987 + 65 = 23,230,052.
export const MAX_UNPACKED_BYTES = repairPackageMeasurement.unpackedBytes
  + repairPackageMeasurement.payloadPlatformProjection + repairPackageMeasurement.payloadAllowance;

const TAR_BLOCK_BYTES = 512;
const TAR_ENTRY_ALLOWANCE_BYTES = TAR_BLOCK_BYTES + (TAR_BLOCK_BYTES - 1);
const TAR_TRAILER_BYTES = TAR_BLOCK_BYTES * 2;

// Each reviewed tar entry needs one 512-byte header plus at most 511 bytes of
// payload padding. Reserve that allowance for every admitted entry, the
// required two-block trailer, and round to the parser's 512-byte alignment.
export const MAX_PACKAGE_TAR_BYTES = Math.ceil(
  (
    MAX_UNPACKED_BYTES
    + MAX_PACKED_ENTRIES * TAR_ENTRY_ALLOWANCE_BYTES
    + TAR_TRAILER_BYTES
  ) / TAR_BLOCK_BYTES,
) * TAR_BLOCK_BYTES;

export const packageArtifactBudget = Object.freeze({
  entryCount: Object.freeze({ min: MAX_PACKED_ENTRIES, max: MAX_PACKED_ENTRIES }),
  fileCount: Object.freeze({ min: MAX_PACKED_FILES, max: MAX_PACKED_FILES }),
  packedBytes: Object.freeze({ min: 1_600_000, max: MAX_PACKED_BYTES }),
  unpackedBytes: Object.freeze({ min: 9_000_000, max: MAX_UNPACKED_BYTES }),
});
