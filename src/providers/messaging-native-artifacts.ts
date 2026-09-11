// Exact admitted native bytes and pinned public PhoneNumberKit resources.
export const MESSAGING_NATIVE_ARTIFACTS = Object.freeze({
  "imessage": {
    "file": "imsg-darwin-arm64.gz",
    "sha256": "77a0db864dfd247cd0a9142dd98997960582e6f150f76ecd3bf1c38944f2bf71",
    "bytes": 5410056,
    "compressedSha256": "50aea08e3f395be2c82f25b4e0e62e256628141a667e8d296d083093471b6018",
    "compressedBytes": 1667784
  },
  "whatsapp": {
    "file": "wacli-darwin-arm64.gz",
    "sha256": "9b77ffb810d028fde725ca02b1451f1725b5ff5312a46a54468a9a38533d4cea",
    "bytes": 21963810,
    "compressedSha256": "1c1650d6c79b74db7f8f335b4746398c802031260a90468312dcaac0374a5166",
    "compressedBytes": 7682949
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
