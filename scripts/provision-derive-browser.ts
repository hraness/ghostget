import { chmod, lstat, mkdir, mkdtemp, open, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

export async function provisionDeriveBrowser(): Promise<string> {
  if (process.env[deriveBrowserRootVariable]) return (await DeriveBrowserToolchain.load()).root;
  const artifact = deriveBrowserArtifact();
  const root = await realpath(await mkdtemp(join(tmpdir(), "wrench-derive-toolchain-")));
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
  return (await DeriveBrowserToolchain.load(root)).root;
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
