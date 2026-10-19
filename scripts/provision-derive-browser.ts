import { chmod, lstat, mkdir, mkdtemp, open, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  browserFileSha256, browserTree, browserTreeSha256, deriveBrowserArchiveUrl,
  deriveBrowserArtifact, deriveBrowserVersion, type BrowserToolchainReceipt,
  DeriveBrowserToolchain, deriveBrowserRootVariable,
} from "../src/derive-browser-toolchain.test-support";
import { filesForShard, parseShardRequest } from "./ci-test-shard";
import { runCommand } from "../src/browser";

const archiveLimit = 256_000_000;

export function assertBrowserZipEntries(output: string, platform: string): void {
  const entries = output.trimEnd().split("\n");
  if (entries.length === 0 || entries.length > 10_000 || new Set(entries).size !== entries.length
    || entries.some((entry) => !entry.startsWith(`chrome-${platform}/`) || entry.includes("\\")
      || /[\x00-\x1f\x7f]/u.test(entry) || entry.split("/").some((part) => part === "." || part === ".."))) {
    throw new Error("native fixture browser archive layout is invalid");
  }
}

async function command(argv: readonly string[], cwd: string): Promise<string> {
  const result = await runCommand(argv, { cwd, environment: { HOME: cwd, PATH: "/usr/bin:/bin" },
    timeoutMs: 30_000, maxOutputBytes: 2_000_000 });
  if (result.exitCode !== 0) {
    throw new Error("native fixture browser preparation command failed");
  }
  return result.stdout;
}

/**
 * The private parent of every retained root. It is keyed by nothing but the
 * current user, so each pinned archive gets one stable directory beneath it.
 */
export function deriveBrowserCacheParent(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): string {
  const configured = environment.GHOSTGET_DERIVE_BROWSER_CACHE;
  if (configured !== undefined && configured !== "") {
    if (!configured.startsWith("/")) throw new Error("GHOSTGET_DERIVE_BROWSER_CACHE must be an absolute path");
    return configured;
  }
  return join(home, ".cache", "ghostget-derive-browser");
}

/** The content-addressed root name: one directory per pinned platform archive. */
export function deriveBrowserRootName(platform: string, archiveSha256: string): string {
  if (!/^[a-z0-9-]+$/u.test(platform) || !/^[0-9a-f]{64}$/u.test(archiveSha256)) {
    throw new Error("native fixture browser pin is malformed");
  }
  return `${platform}-${archiveSha256}`;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

/**
 * Provision the pinned browser once per archive pin. A retained root is reused
 * only after DeriveBrowserToolchain.load rechecks its archive, executable,
 * payload, and receipt; an invalid retained root fails closed and is never
 * repaired or replaced here. A new root is assembled in a private sibling and
 * renamed into place, so a concurrent provisioner either wins the rename or
 * reuses the winner's verified root.
 */
export async function provisionDeriveBrowser(): Promise<string> {
  if (process.env[deriveBrowserRootVariable]) return (await DeriveBrowserToolchain.load()).root;
  const artifact = deriveBrowserArtifact();
  const configuredParent = deriveBrowserCacheParent();
  await mkdir(configuredParent, { recursive: true, mode: 0o700 });
  const parent = await realpath(configuredParent);
  await chmod(parent, 0o700);
  const stable = join(parent, deriveBrowserRootName(artifact.platform, artifact.archiveSha256));
  try {
    await lstat(stable);
    return (await DeriveBrowserToolchain.load(stable)).root;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const staging = await realpath(await mkdtemp(join(parent, ".staging-")));
  try {
    await assemble(staging, artifact);
    try {
      await rename(staging, stable);
    } catch (error) {
      const code = errorCode(error);
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      return (await DeriveBrowserToolchain.load(stable)).root;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return (await DeriveBrowserToolchain.load(stable)).root;
}

async function assemble(root: string, artifact: ReturnType<typeof deriveBrowserArtifact>): Promise<void> {
  await chmod(root, 0o700);
  const archive = join(root, "browser.zip");
  const payload = join(root, "payload");
  await mkdir(payload, { mode: 0o700 });
  const response = await fetch(deriveBrowserArchiveUrl(artifact), {
    redirect: "error", signal: AbortSignal.timeout(120_000),
  });
  if (response.status !== 200 || response.body === null) throw new Error("native fixture browser download failed");
  const length = Number(response.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 1 || length > archiveLimit) throw new Error("native fixture browser archive size is invalid");
  const file = await open(archive, "wx", 0o600);
  const reader = response.body.getReader();
  let count = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > length || count > archiveLimit) throw new Error("native fixture browser download exceeded its bound");
      await file.writeFile(chunk.value);
    }
    if (count !== length) throw new Error("native fixture browser download was incomplete");
  } finally {
    await reader.cancel().catch(() => undefined);
    await file.close();
  }
  if (await browserFileSha256(archive) !== artifact.archiveSha256) throw new Error("native fixture browser archive integrity failed");
  const listing = await command(["/usr/bin/unzip", "-Z1", archive], root);
  assertBrowserZipEntries(listing, artifact.platform);
  await command(["/usr/bin/unzip", "-q", archive, "-d", payload], root);
  const rows = await browserTree(payload);
  const executable = join(payload, artifact.executable);
  if (browserTreeSha256(rows) !== artifact.treeSha256
    || await browserFileSha256(executable) !== artifact.executableSha256) throw new Error("native fixture browser payload integrity failed");
  // This only prints the exact version; it never starts a profile or a daemon.
  const version = (await command([executable, "--version"], root)).trim();
  if (version !== `Google Chrome for Testing ${deriveBrowserVersion}`) throw new Error("native fixture browser version changed");
  const stat = await lstat(root, { bigint: true });
  const receipt: BrowserToolchainReceipt = {
    schemaVersion: 1, version: deriveBrowserVersion, platform: artifact.platform,
    archiveSha256: artifact.archiveSha256, executableSha256: await browserFileSha256(executable),
    treeSha256: browserTreeSha256(rows),
    directory: { device: stat.dev.toString(), inode: stat.ino.toString(), uid: Number(stat.uid) },
  };
  await writeFile(join(root, "receipt.json"), `${JSON.stringify(receipt)}\n`, { flag: "wx", mode: 0o600 });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 0) {
    if (args.length !== 3 || args[0] !== "--for-shard") throw new Error("expected --for-shard INDEX COUNT or no arguments");
    const request = parseShardRequest({ shard: args[1], shardCount: args[2] });
    if (!(await filesForShard(process.cwd(), request)).includes("src/derive.test.ts")) process.exit(0);
  }
  process.stdout.write(`${await provisionDeriveBrowser()}\n`);
}
