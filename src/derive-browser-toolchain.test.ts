import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeriveBrowserHome, browserFileSha256, browserTree, browserTreeSha256, deriveBrowserArchiveUrl,
  deriveBrowserArtifact, deriveBrowserVersion, parseBrowserToolchainReceipt,
  type BrowserArtifact, type DeriveBrowserToolchain,
} from "./derive-browser-toolchain.test-support";
import { assertBrowserZipEntries } from "../scripts/provision-derive-browser";
import { assertProperty, fc } from "./test-support";

const artifact: BrowserArtifact = { platform: "linux64", archiveSha256: "a".repeat(64),
  executableSha256: "b".repeat(64), treeSha256: "c".repeat(64), executable: "chrome-linux64/chrome" };
const receipt = () => ({ schemaVersion: 1 as const, version: deriveBrowserVersion, platform: "linux64",
  archiveSha256: artifact.archiveSha256, executableSha256: artifact.executableSha256,
  treeSha256: artifact.treeSha256, directory: { device: "1", inode: "2", uid: process.getuid!() } });

test("native fixture toolchain rejects forged and widened receipts", () => {
  expect(parseBrowserToolchainReceipt(receipt(), artifact)).toEqual(receipt());
  for (const value of [null, [], "receipt", { ...receipt(), extra: true },
    { ...receipt(), schemaVersion: 2 }, { ...receipt(), version: "latest" },
    { ...receipt(), platform: "mac-arm64" }, { ...receipt(), archiveSha256: "d".repeat(64) },
    { ...receipt(), executableSha256: "d".repeat(64) }, { ...receipt(), treeSha256: "d".repeat(64) },
    { ...receipt(), directory: null }, { ...receipt(), directory: { ...receipt().directory, extra: true } },
    { ...receipt(), directory: { ...receipt().directory, uid: -1 } },
    { ...receipt(), directory: { ...receipt().directory, inode: "../2" } },
  ]) expect(() => parseBrowserToolchainReceipt(value, artifact)).toThrow("identity changed");
  expect(deriveBrowserArchiveUrl(artifact)).toBe(
    "https://storage.googleapis.com/chrome-for-testing-public/152.0.7977.64/linux64/chrome-linux64.zip",
  );
  expect(() => deriveBrowserArtifact("linux", "arm64")).toThrow("unsupported");
  expect(() => deriveBrowserArtifact("win32", "x64")).toThrow("unsupported");
});

test("native fixture browser archive rejects crossed roots and traversal", () => {
  expect(() => assertBrowserZipEntries("chrome-linux64/\nchrome-linux64/chrome\n", "linux64")).not.toThrow();
  for (const value of ["", "../chrome", "/chrome-linux64/chrome", "chrome-mac-arm64/chrome",
    "chrome-linux64/../outside", "chrome-linux64/./chrome", "chrome-linux64/a\\b", "chrome-linux64/a\0b",
    "chrome-linux64/a\nchrome-linux64/a", "chrome-linux64/a\nforeign/b",
  ]) expect(() => assertBrowserZipEntries(value, "linux64")).toThrow("layout");
});

test("native fixture receipt cannot acquire arbitrary fields or changed artifact identities", () => {
  assertProperty(fc.property(
    fc.string({ minLength: 1, maxLength: 40 }).filter((key) => !Object.hasOwn(receipt(), key)),
    fc.jsonValue(), (key, value) => {
      const foreign = receipt();
      Object.defineProperty(foreign, key, { value, enumerable: true });
      expect(() => parseBrowserToolchainReceipt(foreign, artifact)).toThrow("identity changed");
    },
  ));
  assertProperty(fc.property(
    fc.constantFrom("archiveSha256", "executableSha256", "treeSha256", "platform", "version"),
    fc.string({ maxLength: 96 }), (key, value) => {
      const exact = receipt();
      if (value === exact[key as keyof typeof exact]) return;
      expect(() => parseBrowserToolchainReceipt({ ...exact, [key]: value }, artifact)).toThrow("identity changed");
    },
  ));
});

test("native fixture payload hash binds support bytes, modes, and bounded framework links", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wrench-toolchain-unit-")));
  try {
    writeFileSync(join(root, "chrome"), "fixture", { mode: 0o755 });
    const first = browserTreeSha256(await browserTree(root));
    writeFileSync(join(root, "chrome"), "changed");
    expect(browserTreeSha256(await browserTree(root))).not.toBe(first);
    chmodSync(join(root, "chrome"), 0o777);
    await expect(browserTree(root)).rejects.toThrow("identity changed");
    chmodSync(join(root, "chrome"), 0o755);
    symlinkSync("chrome", join(root, "framework"));
    expect((await browserTree(root)).find((row) => row.path === "framework")?.kind).toBe("symlink");
    unlinkSync(join(root, "framework"));
    symlinkSync("/bin/sh", join(root, "framework"));
    await expect(browserTree(root)).rejects.toThrow("identity changed");
  } finally { rmSync(root, { recursive: true }); }
});

test("native fixture file hash rejects FIFOs and snapshot replacements without waiting", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wrench-toolchain-file-unit-")));
  const path = join(root, "payload");
  const makeFifo = (): void => {
    expect(Bun.spawnSync(["/usr/bin/mkfifo", path], { stdin: "ignore", stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
  };
  try {
    makeFifo();
    await expect(browserFileSha256(path)).rejects.toThrow("identity changed");
    unlinkSync(path);
    writeFileSync(path, "same bytes");
    await expect(browserFileSha256(path, () => { unlinkSync(path); makeFifo(); }))
      .rejects.toThrow("identity changed");
    unlinkSync(path);
    writeFileSync(path, "same bytes");
    await expect(browserFileSha256(path, () => { renameSync(path, join(root, "old")); writeFileSync(path, "same bytes"); }))
      .rejects.toThrow("identity changed");
    unlinkSync(path);
    symlinkSync(join(root, "old"), path);
    await expect(browserFileSha256(path)).rejects.toThrow("identity changed");
  } finally { rmSync(root, { recursive: true }); }
});

test("native fixture HOME admits only the bound toolchain and rejects replacements", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wrench-toolchain-home-unit-")));
  const payload = join(root, "verified-payload");
  mkdirSync(payload, { mode: 0o700 });
  const toolchain = { browserDirectory: payload, assertStable: () => undefined } as unknown as DeriveBrowserToolchain;
  const inherited = { ...process.env };
  try {
    const home = new DeriveBrowserHome(root, toolchain);
    expect(process.env).toEqual(inherited);
    expect(home.environment.HOME).toBe(home.directory);
    for (const name of ["XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR"]) {
      expect(home.environment[name]?.startsWith(`${home.directory}/`)).toBe(true);
    }
    expect(() => home.assertStable()).not.toThrow();
    writeFileSync(join(home.directory, ".config", "fresh-browser-state"), "fixture");
    expect(() => home.assertStable()).not.toThrow();
    const cache = join(home.directory, ".agent-browser", "browsers");
    symlinkSync(payload, join(cache, "chrome-foreign"));
    expect(() => home.assertStable()).toThrow("identity changed");
    unlinkSync(join(cache, "chrome-foreign"));
    renameSync(home.directory, `${home.directory}-original`);
    mkdirSync(home.directory, { mode: 0o700 });
    expect(() => home.assertStable()).toThrow();
  } finally { rmSync(root, { recursive: true }); }
});

test("native fixture provisioning precedes every CI full or selected-shard gate", () => {
  const root = join(import.meta.dir, "..");
  for (const name of ["npm-stage", "release"]) {
    const workflow = readFileSync(join(root, ".github", "workflows", `${name}.yml`), "utf8");
    expect(workflow.indexOf("bun run ./scripts/provision-derive-browser.ts")).toBeGreaterThan(0);
    expect(workflow.indexOf("bun run ./scripts/provision-derive-browser.ts")).toBeLessThan(workflow.indexOf("- run: bun run check"));
    expect(workflow).toContain("WRENCH_DERIVE_BROWSER_ROOT=%s");
  }
  const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  expect(ci.indexOf("bun run ./scripts/provision-derive-browser.ts")).toBeGreaterThan(0);
  expect(ci).toContain("--for-shard '${{ matrix.shard }}' 4");
  expect(ci.indexOf("bun run ./scripts/provision-derive-browser.ts")).toBeLessThan(ci.indexOf("- run: bun run ./scripts/ci-test-shard.ts"));
});
