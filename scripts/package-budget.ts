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
export const MAX_PACKED_BYTES = 2_251_305;
export const MAX_PACKED_ENTRIES = 501;
export const MAX_PACKED_FILES = 501;
export const MAX_UNPACKED_BYTES = 12_413_003;

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
