import { createHash, randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { chmod, link, lstat, mkdir, mkdtemp, open, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o600 || info.size !== expected.bytes || await realpath(path) !== path) throw new Error("Installed iMessage resource differs from its pin");
    const bytes = Buffer.alloc(expected.bytes + 1); let offset = 0;
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (bytesRead === 0) break; offset += bytesRead; }
    const after = await handle.stat(), named = await lstat(path);
    const unchanged = (other: Stats) => (["dev", "ino", "size", "uid", "gid", "mode", "nlink", "mtimeMs", "ctimeMs"] as const).every(key => info[key] === other[key]);
    if (offset !== expected.bytes || sha(bytes.subarray(0, offset)) !== expected.sha256 || !unchanged(after) || !unchanged(named)) throw new Error("Installed iMessage resource differs from its pin");
  }
  finally { await handle.close(); }
}
export async function verifyImsgNativeResources(installDirectory: string): Promise<void> {
  for (const [asset, relative] of resources) await verifyResource(join(installDirectory, "PhoneNumberKit_PhoneNumberKit.bundle", relative), asset);
}

async function operationDirectory(path: string, expected?: Stats): Promise<Stats> {
  if (!isAbsolute(path) || resolve(path) !== path || Buffer.byteLength(path) > 4096 || /[\u0000-\u001f\u007f]/u.test(path)) throw new Error("iMessage resource operation directory must be a physical private path");
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o700 || await realpath(path) !== path
    || expected !== undefined && (info.dev !== expected.dev || info.ino !== expected.ino || info.birthtimeMs !== expected.birthtimeMs)) throw new Error("iMessage resource operation directory changed or is unsafe");
  return info;
}

/** Runtime custody owns the existing operation root and its cleanup. Populate
 * only a fresh adjacent bundle from the fixed package pins; never create an
 * installation directory, repair an existing bundle, or copy caller input. */
export async function materializeImsgNativeResources(operationRoot: string): Promise<void> {
  const directories = new Map<string, Stats>([[operationRoot, await operationDirectory(operationRoot)]]);
  const bundle = join(operationRoot, "PhoneNumberKit_PhoneNumberKit.bundle"), contents = join(bundle, "Contents"), resourceDirectory = join(contents, "Resources");
  const validateDirectories = async () => { for (const [path, identity] of directories) await operationDirectory(path, identity); };
  // Admit every source before making any destination. A missing or corrupt
  // package leaves the operation namespace unchanged.
  const admitted = await Promise.all(resources.map(async ([asset, relative]) => ({ asset, relative, bytes: await readBundledMessagingAsset(asset) })));
  for (const path of [bundle, contents, resourceDirectory]) {
    await validateDirectories();
    // No recursive mkdir and no EEXIST recovery: even a valid existing bundle
    // belongs to a different materialization attempt and must be preserved.
    await mkdir(path, { mode: 0o700 });
    directories.set(path, await operationDirectory(path));
  }
  for (const { asset, relative, bytes } of admitted) {
    await validateDirectories();
    const path = join(bundle, relative), file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o600) throw new Error("iMessage resource output has unsafe metadata");
      await file.writeFile(bytes); await file.sync();
    } finally { await file.close(); }
    await verifyResource(path, asset);
  }
  await validateDirectories();
  for (const [path, names] of [[bundle, ["Contents"]], [contents, ["Info.plist", "Resources"]], [resourceDirectory, ["PhoneNumberMetadata.json", "PrivacyInfo.xcprivacy"]]] as const) {
    if (JSON.stringify((await readdir(path)).sort()) !== JSON.stringify([...names].sort())) throw new Error("iMessage resource bundle contains unexpected files");
  }
  await verifyImsgNativeResources(operationRoot);
  await validateDirectories();
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
export async function installBundledMessagingRuntime(provider: "imessage" | "whatsapp" | "beeper", environment: Environment = process.env): Promise<{ version: string; sha256: string; alreadyPresent?: boolean }> {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Bundled messaging runtimes require Apple silicon macOS");
  if (provider === "beeper") throw new Error("Beeper has no bundled messaging runtime; the pinned local CLI and running Beeper Desktop are installed separately");
  if (provider !== "imessage" && provider !== "whatsapp") throw new Error("Unknown messaging runtime");
  const bytes = await readBundledMessagingAsset(provider), directory = await mkdtemp(join(await realpath(tmpdir()), "wrench-messaging-install-")); await chmod(directory, 0o700);
  const path = join(directory, "runtime"), file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o500);
  try {
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    if (provider === "imessage") { const { installReviewedImsgBinary } = await import("./imessage-direct-install"); const result = await installReviewedImsgBinary(path, environment); return { version: result.version, sha256: result.executableSha256, alreadyPresent: result.alreadyPresent }; }
    const { installReviewedWhatsAppAutomationBinary } = await import("./whatsapp-automation-runtime"); return await installReviewedWhatsAppAutomationBinary(path, environment);
  } finally { await unlink(path); await rmdir(directory); }
}
