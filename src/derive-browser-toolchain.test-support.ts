import { createHash } from "node:crypto";
import { chmodSync, constants, lstatSync, mkdirSync, readdirSync, realpathSync, symlinkSync, type BigIntStats } from "node:fs";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export const deriveBrowserVersion = "152.0.7977.64";
export const deriveBrowserRootVariable = "GHOSTGET_DERIVE_BROWSER_ROOT";

export type BrowserArtifact = Readonly<{
  platform: "linux64" | "mac-arm64" | "mac-x64";
  archiveSha256: string;
  executableSha256: string;
  treeSha256: string;
  executable: string;
}>;

// Exact official CfT archives, independently acquired and verified before
// pinning. Complete payload hashes also bind support files and framework links.
const artifacts: readonly BrowserArtifact[] = [
  { platform: "linux64", archiveSha256: "8b592f066af71f054aab2cc80fc26f73c775c6d44ebb99d16ade924b24756c2e",
    executableSha256: "3ed7df7904694145caf8da676d053f68300e8d2778a507e27b15f142c4efd0af",
    treeSha256: "bf97913b5ba89e7025b4d16dd785d548623447cc9fb8952898cfd75f41bd7513", executable: "chrome-linux64/chrome" },
  { platform: "mac-arm64", archiveSha256: "10033804338bd0a5aa098149a8dd64f3f2e0e8b201bf3d400d7c17d067ff696f",
    executableSha256: "4ce888aa3648db24dcea8704a07f364b4d394d29176fb85c8f4b3fc8b0c19a10",
    treeSha256: "d9ce7fdc8c9d95d8d562ca0b061f1aa7c4895e5ba67bdd5219cdfc78d351fe06",
    executable: "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" },
  { platform: "mac-x64", archiveSha256: "737314b25acc411c4d5b10a2efcc16add19f1ab6db2220f20dad6d1c57dbd59b",
    executableSha256: "e602f55ccce9646c119c87b80339a68df0ff5e318040354348db8e3fe1f8b8ba",
    treeSha256: "65be00a757554f5bbf2eb546072d3d5bb08cb484cf87ec148a5350013663b4ba",
    executable: "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" },
];

export function deriveBrowserArtifact(platform = process.platform, arch = process.arch): BrowserArtifact {
  const name = platform === "linux" && arch === "x64" ? "linux64"
    : platform === "darwin" && arch === "arm64" ? "mac-arm64"
    : platform === "darwin" && arch === "x64" ? "mac-x64" : null;
  const artifact = artifacts.find((value) => value.platform === name);
  if (artifact === undefined) throw new Error("native fixture browser platform is unsupported");
  if (![artifact.archiveSha256, artifact.executableSha256, artifact.treeSha256].every((value) => /^[a-f0-9]{64}$/u.test(value))) {
    throw new Error("native fixture browser artifact is not sealed");
  }
  return artifact;
}

export function deriveBrowserArchiveUrl(artifact: BrowserArtifact): string {
  return `https://storage.googleapis.com/chrome-for-testing-public/${deriveBrowserVersion}/${artifact.platform}/chrome-${artifact.platform}.zip`;
}

export async function browserFileSha256(path: string,
  afterSnapshot: () => void = () => undefined): Promise<string> {
  const snapshot = lstatSync(path, { bigint: true });
  if (!snapshot.isFile() || snapshot.isSymbolicLink()) fail();
  const identity = browserStatIdentity(snapshot);
  // The test seam proves replacement between lstat and open cannot block on a
  // FIFO or admit another inode. Real callers never mutate the snapshot.
  afterSnapshot();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || browserStatIdentity(before) !== identity) fail();
    const hash = createHash("sha256");
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    if (browserStatIdentity(await file.stat({ bigint: true })) !== identity || browserPathIdentity(path) !== identity) fail();
    return hash.digest("hex");
  } finally { await file.close(); }
}

function fail(): never { throw new Error("native fixture browser identity changed"); }

export async function assertPrivateBrowserDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!isAbsolute(path) || !stat.isDirectory() || stat.isSymbolicLink()
    || await realpath(path) !== path || stat.uid !== process.getuid?.()
    || (stat.mode & 0o777) !== 0o700) fail();
}

export type BrowserTreeEntry = Readonly<{
  path: string;
  kind: "file" | "directory" | "symlink";
  mode: number;
  sha256: string | null;
}>;

/** Hash all executable support files, not just the outer Chrome launcher. */
export async function browserTree(root: string,
  capture: (path: string, identity: string) => void = () => undefined): Promise<readonly BrowserTreeEntry[]> {
  const rows: BrowserTreeEntry[] = [];
  let bytes = 0;
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const identity = browserPathIdentity(path);
      capture(path, identity);
      const stat = await lstat(path);
      if (stat.uid !== process.getuid?.() || rows.length >= 10_000) fail();
      const name = relative(root, path).split(sep).join("/");
      if (name === "" || name.startsWith("../") || isAbsolute(name)) fail();
      if (stat.isSymbolicLink()) {
        // Chrome.app's framework links are accepted only inside this exact
        // verified payload. Neither user state nor system libraries may enter.
        const target = await realpath(path);
        if (!target.startsWith(`${root}${sep}`)) fail();
        const { readlink } = await import("node:fs/promises");
        const link = await readlink(path);
        if (isAbsolute(link)) fail();
        rows.push({ path: name, kind: "symlink", mode: stat.mode & 0o777,
          sha256: createHash("sha256").update(link).digest("hex") });
      } else if (stat.isDirectory()) {
        rows.push({ path: name, kind: "directory", mode: stat.mode & 0o777, sha256: null });
        await walk(path);
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 1_500_000_000 || stat.nlink !== 1 || (stat.mode & 0o022) !== 0) fail();
        rows.push({ path: name, kind: "file", mode: stat.mode & 0o777, sha256: await browserFileSha256(path) });
      } else fail();
      if (browserPathIdentity(path) !== identity) fail();
    }
  };
  await walk(root);
  return rows;
}

export function browserTreeSha256(rows: readonly BrowserTreeEntry[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export type BrowserToolchainReceipt = Readonly<{
  schemaVersion: 1;
  version: string;
  platform: string;
  archiveSha256: string;
  executableSha256: string;
  treeSha256: string;
  directory: Readonly<{ device: string; inode: string; uid: number }>;
}>;

export function parseBrowserToolchainReceipt(value: unknown, artifact: BrowserArtifact): BrowserToolchainReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== "archiveSha256,directory,executableSha256,platform,schemaVersion,treeSha256,version"
    || row.schemaVersion !== 1 || row.version !== deriveBrowserVersion || row.platform !== artifact.platform
    || row.archiveSha256 !== artifact.archiveSha256
    || row.executableSha256 !== artifact.executableSha256 || row.treeSha256 !== artifact.treeSha256
    || typeof row.directory !== "object" || row.directory === null || Array.isArray(row.directory)) fail();
  const directory = row.directory as Record<string, unknown>;
  if (Object.keys(directory).sort().join() !== "device,inode,uid"
    || typeof directory.device !== "string" || !/^[0-9]+$/u.test(directory.device)
    || typeof directory.inode !== "string" || !/^[0-9]+$/u.test(directory.inode)
    || !Number.isSafeInteger(directory.uid) || directory.uid !== process.getuid?.()) fail();
  return row as unknown as BrowserToolchainReceipt;
}

export class DeriveBrowserToolchain {
  private metadata: readonly Readonly<{ path: string; identity: string }>[] = [];
  private constructor(readonly root: string, readonly artifact: BrowserArtifact,
    readonly receipt: BrowserToolchainReceipt) {}

  static async load(root = (process.env[deriveBrowserRootVariable] ?? process.env.WRENCH_DERIVE_BROWSER_ROOT)): Promise<DeriveBrowserToolchain> {
    if (typeof root !== "string" || root.length === 0) {
      throw new Error("provision the pinned native fixture browser before running derive native tests");
    }
    await assertPrivateBrowserDirectory(root);
    const artifact = deriveBrowserArtifact();
    const receiptPath = join(root, "receipt.json");
    const stat = await lstat(receiptPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()
      || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 4_096) fail();
    const receipt = parseBrowserToolchainReceipt(JSON.parse(await readFile(receiptPath, "utf8")), artifact);
    const toolchain = new DeriveBrowserToolchain(root, artifact, receipt);
    await toolchain.verify();
    return toolchain;
  }

  get browserDirectory(): string { return join(this.root, "payload"); }
  get executable(): string { return join(this.browserDirectory, this.artifact.executable); }

  async verify(): Promise<void> {
    this.assertStable();
    await assertPrivateBrowserDirectory(this.root);
    const stat = await lstat(this.root, { bigint: true });
    if (stat.dev.toString() !== this.receipt.directory.device || stat.ino.toString() !== this.receipt.directory.inode
      || stat.uid !== BigInt(this.receipt.directory.uid)) fail();
    if ((await readdir(this.root)).sort().join() !== "browser.zip,payload,receipt.json") fail();
    await assertPrivateBrowserDirectory(this.browserDirectory);
    const archive = join(this.root, "browser.zip");
    const archiveStat = await lstat(archive);
    if (!archiveStat.isFile() || archiveStat.isSymbolicLink() || archiveStat.uid !== process.getuid?.()
      || archiveStat.nlink !== 1 || (archiveStat.mode & 0o777) !== 0o600 || archiveStat.size > 256_000_000) fail();
    const initial = this.metadata.length === 0;
    const metadata = initial ? [this.root, archive, this.browserDirectory, join(this.root, "receipt.json")]
      .map((path) => ({ path, identity: browserPathIdentity(path) })) : [...this.metadata];
    const rows = await browserTree(this.browserDirectory, (path, identity) => {
      if (initial) metadata.push({ path, identity });
    });
    if (await browserFileSha256(archive) !== this.artifact.archiveSha256
      || await browserFileSha256(this.executable) !== this.receipt.executableSha256
      || browserTreeSha256(rows) !== this.receipt.treeSha256) fail();
    const executableStat = await lstat(this.executable);
    if (!executableStat.isFile() || executableStat.isSymbolicLink() || (executableStat.mode & 0o111) === 0) fail();
    if (initial) this.metadata = metadata;
    this.assertStable();
  }

  assertStable(): void {
    for (const item of this.metadata) if (browserPathIdentity(item.path) !== item.identity) fail();
  }
}

function browserPathIdentity(path: string): string {
  return browserStatIdentity(lstatSync(path, { bigint: true }));
}

function browserStatIdentity(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.uid, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

/** Only child processes receive this fresh HOME; the user's environment is untouched. */
export class DeriveBrowserHome {
  readonly directory: string;
  private readonly cache: string;
  private readonly candidate: string;
  private readonly metadata;
  private readonly writableRoots;
  readonly environment: Readonly<Record<string, string>>;

  constructor(fixtureDirectory: string, readonly toolchain: DeriveBrowserToolchain) {
    toolchain.assertStable();
    const fixtureStat = lstatSync(fixtureDirectory);
    if (!fixtureStat.isDirectory() || fixtureStat.isSymbolicLink() || realpathSync(fixtureDirectory) !== fixtureDirectory
      || fixtureStat.uid !== process.getuid?.() || (fixtureStat.mode & 0o777) !== 0o700) fail();
    this.directory = join(fixtureDirectory, "browser-home");
    this.cache = join(this.directory, ".agent-browser", "browsers");
    for (const path of [this.directory, join(this.directory, ".agent-browser"), this.cache]) {
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
    }
    const localRoots = { XDG_CONFIG_HOME: join(this.directory, ".config"),
      XDG_CACHE_HOME: join(this.directory, ".cache"), XDG_DATA_HOME: join(this.directory, ".local", "share"),
      XDG_STATE_HOME: join(this.directory, ".local", "state"), XDG_RUNTIME_DIR: join(this.directory, ".run") };
    mkdirSync(join(this.directory, ".local"), { mode: 0o700 });
    for (const path of Object.values(localRoots)) mkdirSync(path, { mode: 0o700 });
    this.environment = Object.freeze({ HOME: this.directory, ...localRoots });
    this.writableRoots = [this.directory, join(this.directory, ".local"), ...Object.values(localRoots)]
      .map((path) => {
        const stat = lstatSync(path, { bigint: true });
        return { path, identity: [stat.dev, stat.ino, stat.uid, stat.mode].join(":") };
      });
    this.candidate = join(this.cache, `chrome-${deriveBrowserVersion}`);
    symlinkSync(toolchain.browserDirectory, this.candidate, "dir");
    this.metadata = [this.directory, join(this.directory, ".agent-browser"), this.cache, this.candidate]
      .map((path) => ({ path, identity: browserPathIdentity(path) }));
    this.assertStable();
  }

  assertStable(): void {
    this.toolchain.assertStable();
    // Chrome may create its own fresh-home files. Only cache directories and
    // the one exact link participate in resolver authority.
    for (const item of this.metadata.slice(1)) if (browserPathIdentity(item.path) !== item.identity) fail();
    for (const item of this.writableRoots) {
      const stat = lstatSync(item.path, { bigint: true });
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(item.path) !== item.path
        || [stat.dev, stat.ino, stat.uid, stat.mode].join(":") !== item.identity) fail();
    }
    if (readdirSync(this.cache).join() !== `chrome-${deriveBrowserVersion}`
      || !lstatSync(this.candidate).isSymbolicLink()
      || realpathSync(this.candidate) !== this.toolchain.browserDirectory) fail();
  }
}
