// Exact admitted native bytes and pinned public PhoneNumberKit resources.
export const MESSAGING_NATIVE_ARTIFACTS = Object.freeze({
  "imessage": {
    "file": "imsg-darwin-arm64.gz",
    "sha256": "60201a816f33acc4d1926680badbf1e3c01f772aa4e8d3e2957bbe82cb06f073",
    "bytes": 5430872,
    "compressedSha256": "a8b2026eeaf5bd2041b3266cca4b7ce6f711ecd25a78d3da7fa5de1163e7149f",
    "compressedBytes": 1680150
  },
  "whatsapp": {
    "file": "wacli-darwin-arm64.gz",
    "sha256": "85a4c2b6f538103df08425f75984657559169a95161a256c6d096daf9de38f47",
    "bytes": 21980338,
    "compressedSha256": "61c9aef8d1a2c38f4831e8546fea0ae9907c365a301b8cde7388e47adbb2d697",
    "compressedBytes": 7694763
  },
  "phoneMetadata": {
    "file": "phone-number-metadata.json.gz",
    "sha256": "cbfe80ee5ee9901f46893a4d2c353d5eb513a21e62529ee5dfaa4e94b4460d83",
    "bytes": 365770,
    "compressedSha256": "27c5818bae151e945f0047fdc5a73f87a44ba678a4eb7343d1f56ef8a2b77e6f",
    "compressedBytes": 51131
  },
  "phonePrivacy": {
    "file": "phone-number-privacy.plist.gz",
    "sha256": "561040f7a52952f75d02d4b6758382ff48c563d6f25c84a09f1a655f6dc60ff8",
    "bytes": 372,
    "compressedSha256": "83585010417bc61a2262f3c051eba0ab275987b02c824184c556f98412db4405",
    "compressedBytes": 240
  },
  "phoneInfo": {
    "file": "phone-number-info.plist.gz",
    "sha256": "161f6c4a3ceaee9ab2ce30e33c80e605a11e196c53e9791f87341e01bf80d7e9",
    "bytes": 532,
    "compressedSha256": "6b41b44fe783ea873ef4a4a90bad1f554f474c0dc46735a95f41ff1f5bfb0729",
    "compressedBytes": 287
  }
} as const);
