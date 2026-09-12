import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdtemp, open, realpath, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { ensurePrivateStateDirectory } from "../storage";
import { MESSAGING_NATIVE_ARTIFACTS } from "./messaging-native-artifacts";

type Environment = Readonly<Record<string, string | undefined>>;
type Asset = keyof typeof MESSAGING_NATIVE_ARTIFACTS;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const resources = [
  ["phoneMetadata", "Contents/Resources/PhoneNumberMetadata.json"],
  ["phonePrivacy", "Contents/Resources/PrivacyInfo.xcprivacy"],
  ["phoneInfo", "Contents/Info.plist"],
] as const;

export async function readBundledMessagingAsset(asset: Asset): Promise<Buffer> {
  const expected = MESSAGING_NATIVE_ARTIFACTS[asset];
  const candidates = [new URL(`../assets/messaging-runtime/${expected.file}`, import.meta.url), new URL(`../src/assets/messaging-runtime/${expected.file}`, import.meta.url)];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    let handle;
    try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw new Error("Bundled messaging asset is unreadable"); }
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== expected.compressedBytes || before.size > 32 * 1024 * 1024 || (before.mode & 0o022) !== 0 || ![0, process.getuid?.()].includes(before.uid) || await realpath(path) !== path) throw new Error("Bundled messaging asset has unsafe metadata");
      const compressed = await handle.readFile(), after = await handle.stat();
      if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || compressed.length !== expected.compressedBytes || sha(compressed) !== expected.compressedSha256) throw new Error("Bundled messaging asset changed or failed its digest");
      const bytes = gunzipSync(compressed, { maxOutputLength: expected.bytes });
      if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) throw new Error("Bundled messaging executable or resource failed its exact pin");
      return bytes;
    } finally { await handle.close(); }
  }
  throw new Error("The installed package omitted its pinned messaging runtime");
}
async function verifyResource(path: string, asset: Asset): Promise<void> {
  const expected = MESSAGING_NATIVE_ARTIFACTS[asset], handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { const info = await handle.stat(); if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600 || info.size !== expected.bytes || await realpath(path) !== path || sha(await handle.readFile()) !== expected.sha256) throw new Error("Installed iMessage resource differs from its pin"); }
  finally { await handle.close(); }
}
export async function verifyImsgNativeResources(installDirectory: string): Promise<void> {
  for (const [asset, relative] of resources) await verifyResource(join(installDirectory, "PhoneNumberKit_PhoneNumberKit.bundle", relative), asset);
}
export async function ensureImsgNativeResources(installDirectory: string, environment: Environment): Promise<void> {
  for (const [asset, relative] of resources) {
    const path = join(installDirectory, "PhoneNumberKit_PhoneNumberKit.bundle", relative), parent = dirname(path);
    ensurePrivateStateDirectory(parent, environment);
    try { await lstat(path); await verifyResource(path, asset); continue; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const bytes = await readBundledMessagingAsset(asset), temporary = join(parent, `.install-${randomBytes(16).toString("hex")}`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      try { await link(temporary, path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } finally { await unlink(temporary); }
    await verifyResource(path, asset); const directory = await open(parent, constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
  }
}

/** Owner setup only. Installing resources never pairs, opens Messages, changes
 * OS permissions, connects a provider, or grants messaging authority. */
export async function installBundledMessagingRuntime(provider: "imessage" | "whatsapp", environment: Environment = process.env): Promise<{ version: string; sha256: string; alreadyPresent?: boolean }> {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Bundled messaging runtimes require Apple silicon macOS");
  if (provider !== "imessage" && provider !== "whatsapp") throw new Error("Unknown messaging runtime");
  const bytes = await readBundledMessagingAsset(provider), directory = await mkdtemp(join(await realpath(tmpdir()), "wrench-messaging-install-")); await chmod(directory, 0o700);
  const path = join(directory, "runtime"), file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o500);
  try {
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    if (provider === "imessage") { const { installReviewedImsgBinary } = await import("./imessage-direct-install"); const result = await installReviewedImsgBinary(path, environment); return { version: result.version, sha256: result.executableSha256, alreadyPresent: result.alreadyPresent }; }
    const { installReviewedWhatsAppAutomationBinary } = await import("./whatsapp-automation-runtime"); return await installReviewedWhatsAppAutomationBinary(path, environment);
  } finally { await unlink(path); await rmdir(directory); }
}
