// After a clean Bun 1.3.14 build, two npm 11.19.0 packs of the 0.16.9
// Effect read candidate were byte-identical:
// 2,228,738 packed bytes, 12,313,147 unpacked bytes, and 482 files.
// Their SHA-256 was
// 989973905a2314294e9e89c38602b22f8912784e3eedb1152bc703685a40bd1f.
// Same-run main b9f6ef8 measured 2,214,287 packed / 12,248,757 unpacked
// bytes and 466 files. Growth includes 16 new read/scanner source files,
// changed orchestration and the 0.16.9 source identity and release notes.
// The 2,233,064-byte packed ceiling leaves 4,326 bytes above this candidate;
// retain 938 unpacked bytes of headroom and an exact 482-file inventory.
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
export const MAX_PACKED_BYTES = 2_233_064;
export const MAX_PACKED_ENTRIES = 482;
export const MAX_PACKED_FILES = 482;
export const MAX_UNPACKED_BYTES = 12_314_085;

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
