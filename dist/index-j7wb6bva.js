// @bun
import {
  ensurePrivateStateDirectory
} from "./index-cf2w5xjy.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/providers/messaging-native-install.ts
import { createHash, randomBytes } from "crypto";
import { constants } from "fs";
import { chmod, link, lstat, mkdir, mkdtemp, open, readdir, realpath, rmdir, unlink } from "fs/promises";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import { gunzipSync } from "zlib";

// src/providers/messaging-native-artifacts.ts
var MESSAGING_NATIVE_ARTIFACTS = Object.freeze({
  imessage: {
    file: "imsg-darwin-arm64.gz",
    sha256: "46c4c73c81c7db2d516c2d467c66aff03c73de196996d646bc8afce0ea85cff6",
    bytes: 4525960,
    compressedSha256: "12861bdb93779405f7cc4cb4a47fc1d6ea3bf2fc8cec5ed69f2197ce96804532",
    compressedBytes: 1490956
  },
  whatsapp: {
    file: "wacli-darwin-arm64.gz",
    sha256: "9b77ffb810d028fde725ca02b1451f1725b5ff5312a46a54468a9a38533d4cea",
    bytes: 21963810,
    compressedSha256: "1c1650d6c79b74db7f8f335b4746398c802031260a90468312dcaac0374a5166",
    compressedBytes: 7682949
  },
  phoneMetadata: {
    file: "phone-number-metadata.json.gz",
    sha256: "cbfe80ee5ee9901f46893a4d2c353d5eb513a21e62529ee5dfaa4e94b4460d83",
    bytes: 365770,
    compressedSha256: "27c5818bae151e945f0047fdc5a73f87a44ba678a4eb7343d1f56ef8a2b77e6f",
    compressedBytes: 51131
  },
  phonePrivacy: {
    file: "phone-number-privacy.plist.gz",
    sha256: "561040f7a52952f75d02d4b6758382ff48c563d6f25c84a09f1a655f6dc60ff8",
    bytes: 372,
    compressedSha256: "83585010417bc61a2262f3c051eba0ab275987b02c824184c556f98412db4405",
    compressedBytes: 240
  },
  phoneInfo: {
    file: "phone-number-info.plist.gz",
    sha256: "161f6c4a3ceaee9ab2ce30e33c80e605a11e196c53e9791f87341e01bf80d7e9",
    bytes: 532,
    compressedSha256: "6b41b44fe783ea873ef4a4a90bad1f554f474c0dc46735a95f41ff1f5bfb0729",
    compressedBytes: 287
  }
});

// src/providers/messaging-native-install.ts
var sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
var resources = [
  ["phoneMetadata", "Contents/Resources/PhoneNumberMetadata.json"],
  ["phonePrivacy", "Contents/Resources/PrivacyInfo.xcprivacy"],
  ["phoneInfo", "Contents/Info.plist"]
];
async function readBundledMessagingAsset(asset) {
  const expected = MESSAGING_NATIVE_ARTIFACTS[asset];
  const candidates = [new URL(`../assets/messaging-runtime/${expected.file}`, import.meta.url), new URL(`../src/assets/messaging-runtime/${expected.file}`, import.meta.url)];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (error.code === "ENOENT")
        continue;
      throw new Error("Bundled messaging asset is unreadable");
    }
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== expected.compressedBytes || before.size > 32 * 1024 * 1024 || (before.mode & 18) !== 0 || ![0, process.getuid?.()].includes(before.uid) || await realpath(path) !== path)
        throw new Error("Bundled messaging asset has unsafe metadata");
      const compressed = await handle.readFile(), after = await handle.stat();
      if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || compressed.length !== expected.compressedBytes || sha(compressed) !== expected.compressedSha256)
        throw new Error("Bundled messaging asset changed or failed its digest");
      const bytes = gunzipSync(compressed, { maxOutputLength: expected.bytes });
      if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256)
        throw new Error("Bundled messaging executable or resource failed its exact pin");
      return bytes;
    } finally {
      await handle.close();
    }
  }
  throw new Error("The installed package omitted its pinned messaging runtime");
}
async function verifyResource(path, asset) {
  const expected = MESSAGING_NATIVE_ARTIFACTS[asset], handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 4095) !== 384 || info.size !== expected.bytes || await realpath(path) !== path)
      throw new Error("Installed iMessage resource differs from its pin");
    const bytes = Buffer.alloc(expected.bytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0)
        break;
      offset += bytesRead;
    }
    const after = await handle.stat(), named = await lstat(path);
    const unchanged = (other) => ["dev", "ino", "size", "uid", "gid", "mode", "nlink", "mtimeMs", "ctimeMs"].every((key) => info[key] === other[key]);
    if (offset !== expected.bytes || sha(bytes.subarray(0, offset)) !== expected.sha256 || !unchanged(after) || !unchanged(named))
      throw new Error("Installed iMessage resource differs from its pin");
  } finally {
    await handle.close();
  }
}
async function verifyImsgNativeResources(installDirectory) {
  for (const [asset, relative] of resources)
    await verifyResource(join(installDirectory, "PhoneNumberKit_PhoneNumberKit.bundle", relative), asset);
}
async function operationDirectory(path, expected) {
  if (!isAbsolute(path) || resolve(path) !== path || Buffer.byteLength(path) > 4096 || /[\u0000-\u001f\u007f]/u.test(path))
    throw new Error("iMessage resource operation directory must be a physical private path");
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 4095) !== 448 || await realpath(path) !== path || expected !== undefined && (info.dev !== expected.dev || info.ino !== expected.ino || info.birthtimeMs !== expected.birthtimeMs))
    throw new Error("iMessage resource operation directory changed or is unsafe");
  return info;
}
async function materializeImsgNativeResources(operationRoot) {
  const directories = new Map([[operationRoot, await operationDirectory(operationRoot)]]);
  const bundle = join(operationRoot, "PhoneNumberKit_PhoneNumberKit.bundle"), contents = join(bundle, "Contents"), resourceDirectory = join(contents, "Resources");
  const validateDirectories = async () => {
    for (const [path, identity] of directories)
      await operationDirectory(path, identity);
  };
  const admitted = await Promise.all(resources.map(async ([asset, relative]) => ({ asset, relative, bytes: await readBundledMessagingAsset(asset) })));
  for (const path of [bundle, contents, resourceDirectory]) {
    await validateDirectories();
    await mkdir(path, { mode: 448 });
    directories.set(path, await operationDirectory(path));
  }
  for (const { asset, relative, bytes } of admitted) {
    await validateDirectories();
    const path = join(bundle, relative), file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 384);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 4095) !== 384)
        throw new Error("iMessage resource output has unsafe metadata");
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await verifyResource(path, asset);
  }
  await validateDirectories();
  for (const [path, names] of [[bundle, ["Contents"]], [contents, ["Info.plist", "Resources"]], [resourceDirectory, ["PhoneNumberMetadata.json", "PrivacyInfo.xcprivacy"]]]) {
    if (JSON.stringify((await readdir(path)).sort()) !== JSON.stringify([...names].sort()))
      throw new Error("iMessage resource bundle contains unexpected files");
  }
  await verifyImsgNativeResources(operationRoot);
  await validateDirectories();
}
async function ensureImsgNativeResources(installDirectory, environment) {
  for (const [asset, relative] of resources) {
    const path = join(installDirectory, "PhoneNumberKit_PhoneNumberKit.bundle", relative), parent = dirname(path);
    ensurePrivateStateDirectory(parent, environment);
    try {
      await lstat(path);
      await verifyResource(path, asset);
      continue;
    } catch (error) {
      if (error.code !== "ENOENT")
        throw error;
    }
    const bytes = await readBundledMessagingAsset(asset), temporary = join(parent, `.install-${randomBytes(16).toString("hex")}`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 384);
    try {
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, path);
      } catch (error) {
        if (error.code !== "EEXIST")
          throw error;
      }
    } finally {
      await unlink(temporary);
    }
    await verifyResource(path, asset);
    const directory = await open(parent, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
async function installBundledMessagingRuntime(provider, environment = process.env) {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Bundled messaging runtimes require Apple silicon macOS");
  if (provider === "beeper")
    throw new Error("Beeper has no bundled messaging runtime; the pinned local CLI and running Beeper Desktop are installed separately");
  if (provider !== "imessage" && provider !== "whatsapp")
    throw new Error("Unknown messaging runtime");
  const bytes = await readBundledMessagingAsset(provider), directory = await mkdtemp(join(await realpath(tmpdir()), "wrench-messaging-install-"));
  await chmod(directory, 448);
  const path = join(directory, "runtime"), file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 320);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    if (provider === "imessage") {
      const { installReviewedImsgBinary } = await import("./imessage-direct-install-ke2gvpf9.js");
      const result = await installReviewedImsgBinary(path, environment);
      return { version: result.version, sha256: result.executableSha256, alreadyPresent: result.alreadyPresent };
    }
    const { installReviewedWhatsAppAutomationBinary } = await import("./whatsapp-automation-runtime-acsmvk28.js");
    return await installReviewedWhatsAppAutomationBinary(path, environment);
  } finally {
    await unlink(path);
    await rmdir(directory);
  }
}

export { readBundledMessagingAsset, verifyImsgNativeResources, materializeImsgNativeResources, ensureImsgNativeResources, installBundledMessagingRuntime };
