// Ghostget 0.18.1 source plus the LinkedIn `contacts.read` csrf-token
// omit on the Contact-info navigation POST (adapter bundle 1.36.0),
// measured with no version bump: a Bun 1.3.14
// `pm pack` on Linux x64
// shares 22,508,497 payload bytes across exactly 558 files. The bun
// archive is 11,507,604 compressed bytes, SHA-256
// 170dac25ba3eaa4176d604a103a08dd4dff424feaf23454ad407f4524ffe0d99.
// Omitting csrf-token on that POST, adapter notes, changelog, and
// tests add 3,579 payload bytes compared with the 1.35.0
// measurement. Raise only the payload ceiling to the measured value
// plus 65 bytes of headroom (22,508,562); the packed size stays under
// the existing packed allowance and the 558-entry inventory is
// unchanged. Theme CSS stays website-only. Fresh Linux CI independently
// checks its actual canonical archive.
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
export const MAX_PACKED_BYTES = 11_658_467;
export const MAX_PACKED_ENTRIES = 558;
export const MAX_PACKED_FILES = 558;
export const MAX_UNPACKED_BYTES = 22_508_562;

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
