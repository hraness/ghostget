// Admission limits for the lean public package. Local 0.19.0 measurement used
// npm 11.19.0 / Node 24.20.0 / zlib 1.2.12 on darwin-arm64. The release gate
// independently measures its own exact archive. Historical budget records live
// in the private predecessor archive; these limits never exceed its final caps.
export const repairPackageMeasurement = Object.freeze({
  scope: "lean public GhostGet 0.19.0",
  command: "npm pack --ignore-scripts",
  npmVersion: "11.19.0", nodeVersion: "24.20.0", zlibVersion: "1.2.12", platform: "darwin-arm64",
  archiveSha256: "987b25d0fd5592a6dbd5469a23d78bd785aa8cc2c9d7fc378a5081abfdf6bee2",
  packedBytes: 12147753, unpackedBytes: 23983153, entryCount: 629,
  packedPlatformProjection: 12_387, packedPortabilityAllowance: 4_096,
  payloadPlatformProjection: 353, payloadAllowance: 1_656,
});
export const MAX_PACKED_BYTES = repairPackageMeasurement.packedBytes
  + repairPackageMeasurement.packedPlatformProjection + repairPackageMeasurement.packedPortabilityAllowance;
export const MAX_PACKED_ENTRIES = repairPackageMeasurement.entryCount;
export const MAX_PACKED_FILES = repairPackageMeasurement.entryCount;
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
