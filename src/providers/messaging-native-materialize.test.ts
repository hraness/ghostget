import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { assertAsyncProperty, fc } from "../test-support";
import { MESSAGING_NATIVE_ARTIFACTS } from "./messaging-native-artifacts";
import { materializeImsgNativeResources, verifyImsgNativeResources } from "./messaging-native-install";

const roots: string[] = [];
const bundleName = "PhoneNumberKit_PhoneNumberKit.bundle";
const files = [
  ["phoneMetadata", "Contents/Resources/PhoneNumberMetadata.json"],
  ["phonePrivacy", "Contents/Resources/PrivacyInfo.xcprivacy"],
  ["phoneInfo", "Contents/Info.plist"],
] as const;
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ghostget-imsg-resources-"))); roots.push(root);
  await chmod(root, 0o700);
  const operation = join(root, "operation"), bundle = join(operation, bundleName);
  await mkdir(operation, { mode: 0o700 });
  return { root, operation, bundle };
}

test("an operation gets only the exact adjacent pinned resource bundle with private modes", async () => {
  const f = await fixture(), executable = join(f.operation, "imsg");
  await writeFile(executable, "synthetic executable", { mode: 0o500 });
  await materializeImsgNativeResources(f.operation);
  await verifyImsgNativeResources(f.operation);
  expect((await readdir(f.root)).sort()).toEqual(["operation"]);
  expect((await readdir(f.operation)).sort()).toEqual([bundleName, "imsg"].sort());
  expect(await readdir(f.bundle)).toEqual(["Contents"]);
  expect((await readdir(join(f.bundle, "Contents"))).sort()).toEqual(["Info.plist", "Resources"]);
  expect((await readdir(join(f.bundle, "Contents", "Resources"))).sort()).toEqual(["PhoneNumberMetadata.json", "PrivacyInfo.xcprivacy"]);
  for (const path of [f.operation, f.bundle, join(f.bundle, "Contents"), join(f.bundle, "Contents", "Resources")]) {
    const info = await lstat(path);
    expect(info.mode & 0o7777).toBe(0o700); expect(info.uid).toBe(process.getuid!()); expect(info.isSymbolicLink()).toBe(false);
  }
  for (const [asset, path] of files) {
    const bytes = await readFile(join(f.bundle, path)), info = await lstat(join(f.bundle, path)), pin = MESSAGING_NATIVE_ARTIFACTS[asset];
    expect(bytes.length).toBe(pin.bytes); expect(createHash("sha256").update(bytes).digest("hex")).toBe(pin.sha256);
    expect(info.mode & 0o7777).toBe(0o600); expect(info.uid).toBe(process.getuid!()); expect(info.nlink).toBe(1);
  }
  expect(await readFile(executable, "utf8")).toBe("synthetic executable");
  expect((await lstat(executable)).mode & 0o7777).toBe(0o500);
});

test("materialization preserves any existing bundle namespace, including valid prior output", async () => {
  for (const kind of ["empty", "partial", "file", "valid"] as const) {
    const f = await fixture();
    if (kind === "valid") await materializeImsgNativeResources(f.operation);
    else if (kind === "file") await writeFile(f.bundle, "existing namespace", { mode: 0o600 });
    else {
      await mkdir(f.bundle, { mode: 0o700 });
      if (kind === "partial") await writeFile(join(f.bundle, "keep"), "existing namespace", { mode: 0o600 });
    }
    const before = await lstat(f.bundle);
    await expect(materializeImsgNativeResources(f.operation)).rejects.toThrow();
    const after = await lstat(f.bundle);
    expect([after.dev, after.ino, after.mode, after.mtimeMs, after.ctimeMs]).toEqual([before.dev, before.ino, before.mode, before.mtimeMs, before.ctimeMs]);
    if (kind === "valid") await verifyImsgNativeResources(f.operation);
    else if (kind === "file") expect(await readFile(f.bundle, "utf8")).toBe("existing namespace");
    else expect(await readdir(f.bundle)).toEqual(kind === "empty" ? [] : ["keep"]);
  }
});

test("symlink roots, ancestors and bundle destinations never change their targets", async () => {
  const f = await fixture(), linked = join(f.root, "linked"), bundleTarget = join(f.root, "bundle-target");
  await symlink(f.operation, linked);
  await expect(materializeImsgNativeResources(linked)).rejects.toThrow();
  const alias = join(f.root, "alias"); await symlink(f.root, alias);
  await expect(materializeImsgNativeResources(join(alias, "operation"))).rejects.toThrow();
  await mkdir(bundleTarget, { mode: 0o700 }); await writeFile(join(bundleTarget, "keep"), "unrelated", { mode: 0o600 });
  await symlink(bundleTarget, f.bundle);
  await expect(materializeImsgNativeResources(f.operation)).rejects.toThrow();
  expect((await lstat(f.bundle)).isSymbolicLink()).toBe(true);
  expect(await readdir(bundleTarget)).toEqual(["keep"]);
  expect(await readFile(join(bundleTarget, "keep"), "utf8")).toBe("unrelated");
});

test("noncanonical, missing and non-directory roots do not create any ancestors", async () => {
  const f = await fixture(), file = join(f.root, "file"); await writeFile(file, "keep", { mode: 0o600 });
  for (const path of [relative(process.cwd(), f.operation), `${f.operation}/`, `${f.operation}/../${basename(f.operation)}`, `${f.operation}/.`, `${f.operation}//child`, `${f.operation}\0`, `${f.operation}\n`, `${f.operation}/${"x".repeat(4096)}`, join(f.root, "missing", "child"), file]) {
    await expect(materializeImsgNativeResources(path)).rejects.toThrow();
  }
  expect((await readdir(f.root)).sort()).toEqual(["file", "operation"]);
  expect(await readdir(f.operation)).toEqual([]);
  expect(await readFile(file, "utf8")).toBe("keep");
});

test("every nonprivate root permission mode is rejected before materialization", async () => {
  // Some filesystems clear special mode bits on chmod; vary the portable
  // permission bits so every generated value describes the actual root mode.
  await assertAsyncProperty(fc.asyncProperty(fc.integer({ min: 0, max: 0o777 }).filter(mode => mode !== 0o700), async mode => {
    const f = await fixture();
    try {
      await chmod(f.operation, mode);
      await expect(materializeImsgNativeResources(f.operation)).rejects.toThrow();
    } finally { await chmod(f.operation, 0o700); }
    expect(await readdir(f.operation)).toEqual([]);
  }), { numRuns: 32 });
});

test("modified resource bytes and modes fail verification and are never repaired in place", async () => {
  for (const failure of ["bytes", "mode", "symlink", "missing"] as const) {
    const f = await fixture(); await materializeImsgNativeResources(f.operation);
    const path = join(f.bundle, "Contents", "Resources", "PhoneNumberMetadata.json");
    const target = join(f.root, "unrelated");
    if (failure === "bytes") { const bytes = await readFile(path); bytes[0] = bytes[0]! ^ 1; await writeFile(path, bytes); }
    else if (failure === "mode") await chmod(path, 0o640);
    else { await unlink(path); if (failure === "symlink") { await writeFile(target, "unrelated", { mode: 0o600 }); await symlink(target, path); } }
    await expect(verifyImsgNativeResources(f.operation)).rejects.toThrow();
    await expect(materializeImsgNativeResources(f.operation)).rejects.toThrow();
    if (failure === "symlink") expect(await readFile(target, "utf8")).toBe("unrelated");
    if (failure === "mode") expect((await lstat(path)).mode & 0o777).toBe(0o640);
    if (failure === "missing") await expect(lstat(path)).rejects.toThrow();
  }
});
