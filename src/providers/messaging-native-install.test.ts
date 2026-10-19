import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MESSAGING_NATIVE_ARTIFACTS } from "./messaging-native-artifacts";
import { ensureImsgNativeResources, installBundledMessagingRuntime, readBundledMessagingAsset, verifyImsgNativeResources } from "./messaging-native-install";
import { imsgInstalledBinaryPath, resolvePinnedImsgBinary } from "./imessage-direct-install";
import { resolveWhatsAppAutomationBinary, whatsappAutomationBinaryPath } from "./whatsapp-automation-runtime";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "ghostget-native-install-"))); directories.push(directory); await chmod(directory, 0o700);
  const environment = { GHOSTGET_STATE_HOME: join(directory, "ghostget") };
  return { directory, environment, install: dirname(imsgInstalledBinaryPath(environment)) };
}
test("bundled messaging assets decompress only to the exact admitted native and resource bytes", async () => {
  for (const asset of Object.keys(MESSAGING_NATIVE_ARTIFACTS) as Array<keyof typeof MESSAGING_NATIVE_ARTIFACTS>) {
    const bytes = await readBundledMessagingAsset(asset), expected = MESSAGING_NATIVE_ARTIFACTS[asset];
    expect(bytes.length).toBe(expected.bytes); expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected.sha256);
  }
});
test("iMessage resource setup is private, exact, idempotent and preserves mismatched files", async () => {
  const f = await fixture(); await ensureImsgNativeResources(f.install, f.environment); await ensureImsgNativeResources(f.install, f.environment); await verifyImsgNativeResources(f.install);
  const path = join(f.install, "PhoneNumberKit_PhoneNumberKit.bundle", "Contents", "Resources", "PhoneNumberMetadata.json");
  expect((await lstat(path)).mode & 0o777).toBe(0o600); expect((await lstat(dirname(path))).mode & 0o777).toBe(0o700);
  await writeFile(path, "unreviewed resource", { mode: 0o600 });
  await expect(ensureImsgNativeResources(f.install, f.environment)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("unreviewed resource");
});
test("iMessage resources reject symlink destinations without touching the target", async () => {
  const f = await fixture(); await ensureImsgNativeResources(f.install, f.environment);
  const path = join(f.install, "PhoneNumberKit_PhoneNumberKit.bundle", "Contents", "Resources", "PhoneNumberMetadata.json"), target = join(f.directory, "unrelated");
  await writeFile(target, "untouched", { mode: 0o600 }); await unlink(path); await symlink(target, path);
  await expect(ensureImsgNativeResources(f.install, f.environment)).rejects.toThrow(); expect(await readFile(target, "utf8")).toBe("untouched");
});
test.skipIf(process.platform !== "darwin" || process.arch !== "arm64")("bundled runtime setup installs both exact private executables without activation", async () => {
  const f = await fixture();
  for (const provider of ["imessage", "whatsapp"] as const) {
    const result = await installBundledMessagingRuntime(provider, f.environment);
    expect(result.sha256).toBe(MESSAGING_NATIVE_ARTIFACTS[provider].sha256);
    const path = provider === "imessage" ? await resolvePinnedImsgBinary(f.environment) : await resolveWhatsAppAutomationBinary(f.environment);
    expect((await lstat(path)).mode & 0o777).toBe(0o500);
    const second = await installBundledMessagingRuntime(provider, f.environment); expect(second.sha256).toBe(result.sha256);
  }
  const path = whatsappAutomationBinaryPath(f.environment); await chmod(path, 0o700); await writeFile(path, "existing different executable"); await chmod(path, 0o500);
  await expect(installBundledMessagingRuntime("whatsapp", f.environment)).rejects.toThrow(); expect(await readFile(path, "utf8")).toBe("existing different executable");
});
test("iMessage resource setup refuses a non-directory without overwriting it", async () => {
  const f = await fixture(); await mkdir(f.install, { recursive: true, mode: 0o700 });
  const path = join(f.install, "PhoneNumberKit_PhoneNumberKit.bundle"); await writeFile(path, "not a bundle", { mode: 0o600 });
  await expect(ensureImsgNativeResources(f.install, f.environment)).rejects.toThrow(); expect(await readFile(path, "utf8")).toBe("not a bundle");
});
