// After a clean Bun 1.3.14 build, two npm 11.19.0 packs of the combined
// 0.16.9 company-read and cleanup candidate were byte-identical:
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
export const MAX_PACKED_BYTES = 2_234_124;
export const MAX_PACKED_ENTRIES = 485;
export const MAX_PACKED_FILES = 485;
export const MAX_UNPACKED_BYTES = 12_321_404;

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
