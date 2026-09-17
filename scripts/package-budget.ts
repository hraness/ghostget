// After a clean Bun 1.3.14 build, one `bun pm pack` artifact of the combined
// LinkedIn profile-activity, Instagram profile-read, Reddit flair candidate,
// and Hraness Accounts CLI auth module was: 2,071,730 packed bytes,
// 12,192,284 unpacked bytes, and 466 files. Its SHA-256 was
// 6acd0d96e45604d3fb4953ca7f6dd14a7b45b28a4b39edf186f71933f6309c00. Prior CI
// measured a 3,543-byte Linux/macOS gzip spread. Keep the existing 2,178,192 packed-byte ceiling
// and 7,716 unpacked bytes of bounded headroom. File
// inventory is exact at 466 after retaining the LinkedIn and Instagram package
// additions, the Reddit flair implementation, reference, and
// immutable v1.12 adapter baseline, and adding the Hraness Accounts CLI
// device-code auth module.
export const MAX_PACKED_BYTES = 2_178_192;
export const MAX_PACKED_ENTRIES = 466;
export const MAX_PACKED_FILES = 466;
export const MAX_UNPACKED_BYTES = 12_200_000;

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
