/**
 * Pinned formal-verification checkers behind `bun run verify:quint` and
 * `bun run verify:lean`.
 *
 * Every checker archive is downloaded at an exact version and admitted only at
 * its pinned byte size and SHA-256, and a cached archive is hashed again on
 * every use. Toolchains are extracted fresh into a private temporary
 * directory. A checker counts only when it finishes and prints its recognized
 * verdict: a timeout, a crash, an unparsed or inconclusive result, and a
 * compile or typecheck alone all fail the run. Sanitized checker logs go to
 * `artifacts/verification/`, which CI retains. This script and
 * `verification/` are development-only and are never packaged.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parseItfTrace } from "./verification-itf.js";

export const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
export const VERIFICATION_ARTIFACTS = "artifacts/verification";

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

export type PlatformKey = "linux-x64" | "linux-arm64" | "darwin-x64" | "darwin-arm64";
export const PLATFORM_KEYS: readonly PlatformKey[] = Object.freeze([
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
]);

export type PinnedArchive = Readonly<{
  /** File name in the download cache. */
  name: string;
  url: string;
  bytes: number;
  sha256: string;
  format: "tar.gz" | "tar.zst";
  /** The single top-level entry the archive must contain. */
  entry: string;
}>;

const releaseAsset = (repository: string, tag: string, name: string): string =>
  `https://github.com/${repository}/releases/download/${tag}/${name}`;

function pinned(archive: PinnedArchive): PinnedArchive {
  return Object.freeze({ ...archive });
}

function perPlatform(
  archives: Readonly<Record<PlatformKey, PinnedArchive>>,
): Readonly<Record<PlatformKey, PinnedArchive>> {
  return Object.freeze({ ...archives });
}

export const QUINT = Object.freeze({
  version: "0.32.0",
  packageName: "@informalsystems/quint",
  cli: "node_modules/@informalsystems/quint/dist/src/cli.js",
});

export const APALACHE = Object.freeze({
  version: "0.62.2",
  build: "f0dec98",
  archive: pinned({
    name: "apalache-0.62.2.tgz",
    url: releaseAsset("apalache-mc/apalache", "v0.62.2", "apalache-0.62.2.tgz"),
    bytes: 192_004_349,
    sha256: "765f610537281a0f25b8c30f2554f19523e2859c824e80e62276653ee23c10e2",
    format: "tar.gz",
    entry: "apalache-0.62.2",
  }),
});

const temurin = (suffix: string, bytes: number, sha256: string): PinnedArchive => {
  const name = `OpenJDK21U-jdk_${suffix}_hotspot_21.0.12.1_1.tar.gz`;
  return pinned({
    name,
    url: releaseAsset("adoptium/temurin21-binaries", "jdk-21.0.12.1%2B1", name),
    bytes,
    sha256,
    format: "tar.gz",
    entry: "jdk-21.0.12.1+1",
  });
};

export const JDK = Object.freeze({
  runtimeVersion: "21.0.12.1+1-LTS",
  vendor: "Eclipse Adoptium",
  vendorVersion: "Temurin-21.0.12.1+1",
  archives: perPlatform({
    "linux-x64": temurin("x64_linux", 207_473_347, "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94"),
    "linux-arm64": temurin("aarch64_linux", 205_641_175, "23e37e026f12f3e706f18938ff611db3032d075b09d0879a25d06718c773e223"),
    "darwin-x64": temurin("x64_mac", 194_316_575, "44db0f08196daf19a47f90d13388b0c943b67663cb537f998fe29e836fa842ce"),
    "darwin-arm64": temurin("aarch64_mac", 200_073_404, "3623232f33a9c3baadf304480b2535f9a3cba8a58d42ecbb438ba267315d9998"),
  }),
});

const elan = (target: string, bytes: number, sha256: string): PinnedArchive => {
  const name = `elan-${target}.tar.gz`;
  return pinned({
    name,
    url: releaseAsset("leanprover/elan", "v4.2.4", name),
    bytes,
    sha256,
    format: "tar.gz",
    entry: "elan-init",
  });
};

export const ELAN = Object.freeze({
  version: "4.2.4",
  archives: perPlatform({
    "linux-x64": elan("x86_64-unknown-linux-gnu", 4_996_571, "42b94d4244e8353142c456ec0e4ca6528fd898a6c604d4059f494e706e431f63"),
    "linux-arm64": elan("aarch64-unknown-linux-gnu", 5_131_114, "05febd124d84ebf994b2e7479922a5650b1e950c17ae3bd1ddd776b65bb72bf9"),
    "darwin-x64": elan("x86_64-apple-darwin", 2_330_818, "8a340b309d8ed2e96f930761fa223b3af57a38f5d253b53ac90293c9516f8cd4"),
    "darwin-arm64": elan("aarch64-apple-darwin", 2_190_845, "7ad829861392c718dfebde3a83b5c8508df47be02af68894b094b0b3952616e5"),
  }),
});

const lean = (suffix: string, bytes: number, sha256: string): PinnedArchive => {
  const entry = `lean-4.34.0-${suffix}`;
  return pinned({
    name: `${entry}.tar.zst`,
    url: releaseAsset("leanprover/lean4", "v4.34.0", `${entry}.tar.zst`),
    bytes,
    sha256,
    format: "tar.zst",
    entry,
  });
};

export const LEAN = Object.freeze({
  version: "4.34.0",
  toolchain: "leanprover/lean4:v4.34.0",
  /** The directory elan uses for the pinned toolchain under `$ELAN_HOME/toolchains`. */
  toolchainDirectory: "leanprover--lean4---v4.34.0",
  archives: perPlatform({
    "linux-x64": lean("linux", 580_367_391, "caaa98356098c85dc0fcbbd28e1ec66f39eb6551829972b752ff20e1286b646b"),
    "linux-arm64": lean("linux_aarch64", 581_973_544, "40b04fdb7fb849d3c80e10c3bbeebc7b7354b6d3f07450b9168c2149b40d2a82"),
    "darwin-x64": lean("darwin", 564_239_871, "e90afe84c0a2aa3583f3ecd08e51fb7eeebb84d36f99b7cac5d3c067fa8640b0"),
    "darwin-arm64": lean("darwin_aarch64", 561_666_156, "69f263fa6e21bbc2466bbfb1affcd92479ee2714c883a07de548e099a5922932"),
  }),
});

/** Every archive this script may download, for pin review and tests. */
export function pinnedArchives(): readonly PinnedArchive[] {
  return [
    APALACHE.archive,
    ...PLATFORM_KEYS.flatMap((key) => [JDK.archives[key], ELAN.archives[key], LEAN.archives[key]]),
  ];
}

/**
 * The first 16 hex digits of SHA-256 over every pinned archive's name, URL,
 * byte count, and digest. The CI cache key carries it, so changing any pin,
 * not only a version, starts a fresh download cache.
 */
export function pinnedArchivesDigest(): string {
  const pins = pinnedArchives().map(({ name, url, bytes, sha256 }) => ({ name, url, bytes, sha256 }));
  return createHash("sha256").update(JSON.stringify(pins)).digest("hex").slice(0, 16);
}

export function platformKey(platform: string = process.platform, arch: string = process.arch): PlatformKey {
  const key = `${platform}-${arch}`;
  const known = PLATFORM_KEYS.find((candidate) => candidate === key);
  if (known === undefined) {
    throw new Error(`The formal-verification toolchain has no pinned archives for ${key}`);
  }
  return known;
}

// Bounds for one checker step. The CI job timeout bounds the whole run.
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const EXTRACT_TIMEOUT_MS = 5 * 60_000;
const QUINT_TIMEOUT_MS = 5 * 60_000;
/**
 * The bound on one `quint run --mbt` trace generation inside the replay test.
 * It must end before the Bun runner timeout that `verify:quint` sets for that
 * test, so a hung Quint fails with this bound's diagnosis rather than the
 * runner's.
 */
export const QUINT_TRACE_TIMEOUT_MS = 90_000;
const APALACHE_TIMEOUT_MS = 10 * 60_000;
const LEAN_BUILD_TIMEOUT_MS = 10 * 60_000;
const SHORT_TIMEOUT_MS = 60_000;
const KILL_GRACE_MS = 5_000;
const MAX_TOOL_OUTPUT_BYTES = 16 * 1024 * 1024;
const FAILURE_TAIL_LINES = 60;

// ---------------------------------------------------------------------------
// Download admission
// ---------------------------------------------------------------------------

export type FetchLike = (
  url: string,
  init: { redirect: "follow"; signal: AbortSignal },
) => Promise<Response>;

export type AdmissionOptions = Readonly<{
  cacheDirectory: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  log?: (line: string) => void;
}>;

/** The download cache: `$GHOSTGET_VERIFICATION_CACHE` or `~/.cache/ghostget-verification`. */
export function verificationCacheDirectory(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): string {
  const configured = environment.GHOSTGET_VERIFICATION_CACHE;
  if (configured !== undefined && configured !== "") {
    if (!isAbsolute(configured)) throw new Error("GHOSTGET_VERIFICATION_CACHE must be an absolute path");
    return configured;
  }
  return join(home, ".cache", "ghostget-verification");
}

async function regularFileDigest(path: string): Promise<Readonly<{ bytes: number; sha256: string }> | null> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
  if (!metadata.isFile()) {
    await rm(path, { recursive: true, force: true });
    return null;
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const data = chunk as Buffer;
    hash.update(data);
    bytes += data.byteLength;
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
    if (bytesWritten <= 0) throw new Error("the download could not be written");
    offset += bytesWritten;
  }
}

async function download(archive: PinnedArchive, target: string, options: AdmissionOptions): Promise<void> {
  const fetchArchive = options.fetch ?? ((url, init) => fetch(url, init));
  const partial = `${target}.${randomUUID()}.partial`;
  const handle = await open(partial, "wx", 0o600);
  let closed = false;
  let admitted = false;
  try {
    options.log?.(`Downloading ${archive.name} (${archive.bytes.toLocaleString("en-US")} bytes)`);
    const response = await fetchArchive(archive.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || response.body === null) {
      throw new Error(`${archive.name}: the download failed with HTTP ${String(response.status)}`);
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && declared !== String(archive.bytes)) {
      await response.body.cancel().catch(() => undefined);
      throw new Error(`${archive.name}: the server declared ${declared} bytes, not the pinned ${String(archive.bytes)}`);
    }
    const hash = createHash("sha256");
    let bytes = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > archive.bytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`${archive.name}: the download exceeds its pinned ${String(archive.bytes)} bytes`);
      }
      hash.update(value);
      await writeAll(handle, value);
    }
    const sha256 = hash.digest("hex");
    if (bytes !== archive.bytes || sha256 !== archive.sha256) {
      throw new Error(
        `${archive.name}: the download is ${String(bytes)} bytes with SHA-256 ${sha256}, not the pinned ${String(archive.bytes)} bytes and ${archive.sha256}`,
      );
    }
    await handle.sync();
    await handle.close();
    closed = true;
    await rename(partial, target);
    admitted = true;
  } finally {
    if (!closed) await handle.close().catch(() => undefined);
    if (!admitted) await rm(partial, { force: true });
  }
}

/**
 * Return the path of a cached archive whose size and SHA-256 equal its pin.
 * A cached file is hashed on every use; a mismatch is deleted and downloaded
 * once more, and a download that does not match its pin fails.
 */
export async function admitArchive(archive: PinnedArchive, options: AdmissionOptions): Promise<string> {
  if (!isAbsolute(options.cacheDirectory)) throw new Error("The verification cache must be an absolute path");
  const downloads = join(options.cacheDirectory, "downloads");
  await mkdir(downloads, { recursive: true, mode: 0o700 });
  await chmod(downloads, 0o700);
  const target = join(downloads, archive.name);
  const cached = await regularFileDigest(target);
  if (cached !== null) {
    if (cached.bytes === archive.bytes && cached.sha256 === archive.sha256) return target;
    options.log?.(`${archive.name}: the cached archive does not match its pin; downloading it again`);
    await rm(target, { force: true });
  }
  await download(archive, target, options);
  options.log?.(`Admitted ${archive.name} at SHA-256 ${archive.sha256}`);
  return target;
}

// ---------------------------------------------------------------------------
// Bounded checker processes
// ---------------------------------------------------------------------------

export type ToolOutcome =
  | Readonly<{ kind: "exited"; exitCode: number; stdout: string; stderr: string }>
  | Readonly<{
    kind: "timed-out" | "output-limit" | "signaled" | "spawn-failed";
    detail: string;
    stdout: string;
    stderr: string;
  }>;

export type ToolRunOptions = Readonly<{
  cwd: string;
  environment: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes?: number;
  /** How long a stopped group gets after SIGTERM, and then after SIGKILL, before its output is abandoned. */
  killGraceMs?: number;
}>;

async function collectOutput(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  onOverflow: () => void,
  abandon: AbortSignal,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflowed = false;
  const cancel = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  abandon.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (overflowed) continue;
      if (total + value.byteLength > limit) {
        overflowed = true;
        onOverflow();
        continue;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    // An abandoned stream ends the capture; the stop reason is reported instead.
  } finally {
    abandon.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Run one checker process in its own process group with an exact environment,
 * a deadline, and bounded output. A timeout or an output overflow stops the
 * whole group and is reported as such, never as a checker verdict.
 */
export async function runTool(command: readonly string[], options: ToolRunOptions): Promise<ToolOutcome> {
  if (process.platform === "win32") throw new Error("The formal-verification checkers run only on Linux and macOS");
  let child: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
  try {
    child = Bun.spawn([...command], {
      cwd: options.cwd,
      env: { ...options.environment },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
    });
  } catch (error) {
    return { kind: "spawn-failed", detail: errorMessage(error), stdout: "", stderr: "" };
  }
  const limit = options.maxOutputBytes ?? MAX_TOOL_OUTPUT_BYTES;
  const grace = options.killGraceMs ?? KILL_GRACE_MS;
  const abandon = new AbortController();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stop: "timed-out" | "output-limit" | null = null;
  const signalGroup = (signal: "SIGTERM" | "SIGKILL"): void => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // The process has already exited.
      }
    }
  };
  const halt = (reason: "timed-out" | "output-limit"): void => {
    if (stop !== null) return;
    stop = reason;
    signalGroup("SIGTERM");
    timers.push(setTimeout(() => {
      signalGroup("SIGKILL");
      timers.push(setTimeout(() => abandon.abort(), grace));
    }, grace));
  };
  timers.push(setTimeout(() => halt("timed-out"), options.timeoutMs));
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      collectOutput(child.stdout, limit, () => halt("output-limit"), abandon.signal),
      collectOutput(child.stderr, limit, () => halt("output-limit"), abandon.signal),
      child.exited,
    ]);
    const stopped: "timed-out" | "output-limit" | null = stop;
    if (stopped === "timed-out") {
      return { kind: stopped, detail: `no result within ${String(options.timeoutMs)} ms`, stdout, stderr };
    }
    if (stopped === "output-limit") {
      return { kind: stopped, detail: `output exceeded ${String(limit)} bytes`, stdout, stderr };
    }
    if (child.signalCode !== null) {
      return { kind: "signaled", detail: `terminated by ${child.signalCode}`, stdout, stderr };
    }
    return { kind: "exited", exitCode, stdout, stderr };
  } finally {
    for (const timer of timers) clearTimeout(timer);
  }
}

export type CheckerResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;

/** Reject a checker run that did not finish; its output is never evidence. */
export function requireFinished(tool: string, outcome: ToolOutcome): CheckerResult {
  if (outcome.kind === "exited") return outcome;
  throw new Error(`${tool} did not finish (${outcome.detail}); a timeout or an interrupted checker run is not evidence`);
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type CheckerVerdict = "pass" | "violation" | "inconclusive";

const lines = (text: string): readonly string[] => text.split(/\r?\n/u);
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** A clean typecheck is a precondition for a checker run, never evidence on its own. */
export function quintTypecheckVerdict(result: CheckerResult): "pass" | "inconclusive" {
  return result.exitCode === 0 && result.stdout.trim() === "" && result.stderr.trim() === ""
    ? "pass"
    : "inconclusive";
}

/** The reproduction line Quint prints for a decimal seed. */
export function quintSeedLine(seed: string): string {
  return `Use --seed=0x${BigInt(seed).toString(16)} --backend=typescript to reproduce.`;
}

/**
 * Classify one `quint run`. A pass needs exit 0, the no-violation line, the
 * requested seed, and no error output; a violation needs exit 1, the
 * violation line, and Quint's invariant error. Anything else is inconclusive.
 */
export function quintSimulationVerdict(result: CheckerResult, seed: string): CheckerVerdict {
  const seeded = lines(result.stdout).some((line) => line.trim() === quintSeedLine(seed));
  const ok = /^\[ok\] No violation found \(/mu.test(result.stdout);
  const violated = /^\[violation\] Found an issue \(/mu.test(result.stdout);
  if (!seeded || ok === violated) return "inconclusive";
  if (result.exitCode === 0 && ok && result.stderr.trim() === "") return "pass";
  if (result.exitCode === 1 && violated && lines(result.stderr).some((line) => line.trim() === "error: Invariant violated")) {
    return "violation";
  }
  return "inconclusive";
}

/**
 * Classify one Apalache `check`. Both verdicts need the pinned version line;
 * a pass needs exit 0, `NoError`, the requested length, and `EXITCODE: OK`;
 * a violation needs exit 12, an `Error` outcome, and `EXITCODE: ERROR (12)`.
 */
export function apalacheVerdict(result: CheckerResult, length: number): CheckerVerdict {
  const text = result.stdout;
  const version = new RegExp(
    `^# APALACHE version: ${escapeRegExp(APALACHE.version)} \\| build: ${escapeRegExp(APALACHE.build)}(?:\\s|$)`,
    "mu",
  );
  if (!version.test(text)) return "inconclusive";
  const noError = /^The outcome is: NoError(?:\s|$)/mu.test(text);
  const error = /^The outcome is: Error(?:\s|$)/mu.test(text);
  if (noError === error) return "inconclusive";
  if (
    result.exitCode === 0 && noError
    && new RegExp(`^Checker reports no error up to computation length ${String(length)}(?:\\s|$)`, "mu").test(text)
    && /^EXITCODE: OK\s*$/mu.test(text)
  ) {
    return "pass";
  }
  if (
    result.exitCode === 12 && error
    && /^Found [1-9][0-9]* error\(s\)(?:\s|$)/mu.test(text)
    && /^EXITCODE: ERROR \(12\)\s*$/mu.test(text)
  ) {
    return "violation";
  }
  return "inconclusive";
}

export function requireVerdict(
  step: string,
  expected: "pass" | "violation",
  verdict: CheckerVerdict,
): void {
  if (verdict === expected) return;
  const reason = verdict === "inconclusive"
    ? "the checker output was not a recognized result, which is not evidence"
    : expected === "pass"
      ? "the checker found a violation"
      : "the checker did not find the seeded defect, so this model is not accepted as evidence";
  throw new Error(`${step}: expected ${expected}, got ${verdict}; ${reason}`);
}

// ---------------------------------------------------------------------------
// Quint model manifest
// ---------------------------------------------------------------------------

export type QuintModel = Readonly<{
  file: string;
  module: string;
  init: string;
  step: string;
  invariants: readonly string[];
  simulation: Readonly<{ seed: string; maxSamples: number; maxSteps: number }>;
  apalache: Readonly<{ length: number }>;
  mutants: readonly Readonly<{ step: string; invariant: string }>[];
  replay: Readonly<{
    test: string;
    target: "reference" | "production";
    traces: number;
    seed: string;
    maxSteps: number;
  }>;
}>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const DECIMAL_SEED = /^[1-9][0-9]{0,15}$/u;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must have exactly the fields ${expected.join(", ")}`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`${label} must be a Quint identifier`);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${String(minimum)} to ${String(maximum)}`);
  }
  return value;
}

function decimalSeed(value: unknown, label: string): string {
  if (typeof value !== "string" || !DECIMAL_SEED.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} must be a decimal seed string`);
  }
  return value;
}

function uniqueIdentifiers(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new Error(`${label} must be a non-empty list`);
  }
  const items = value.map((item, index) => identifier(item, `${label}[${String(index)}]`));
  if (new Set(items).size !== items.length) throw new Error(`${label} must not repeat an entry`);
  return Object.freeze(items);
}

/** Parse `verification/quint/models.json`. Every model needs a mutant and a replay test. */
export function parseQuintModels(value: unknown): readonly QuintModel[] {
  const manifest = exactObject(value, ["schema", "models"], "models.json");
  if (manifest.schema !== "ghostget-quint-models-v1") throw new Error("models.json has an unknown schema");
  if (!Array.isArray(manifest.models) || manifest.models.length === 0 || manifest.models.length > 64) {
    throw new Error("models.json must list between 1 and 64 models");
  }
  const models = manifest.models.map((entry, index): QuintModel => {
    const label = `models[${String(index)}]`;
    const model = exactObject(entry, [
      "file", "module", "init", "step", "invariants", "simulation", "apalache", "mutants", "replay",
    ], label);
    if (typeof model.file !== "string" || !/^[a-z0-9][a-z0-9-]*\.qnt$/u.test(model.file)) {
      throw new Error(`${label}.file must name a .qnt file in verification/quint`);
    }
    const simulation = exactObject(model.simulation, ["seed", "maxSamples", "maxSteps"], `${label}.simulation`);
    const apalache = exactObject(model.apalache, ["length"], `${label}.apalache`);
    const replay = exactObject(model.replay, ["test", "target", "traces", "seed", "maxSteps"], `${label}.replay`);
    if (typeof replay.test !== "string" || !/^(?:scripts|src)\/[a-z0-9][a-z0-9./-]*\.test\.ts$/u.test(replay.test)
      || replay.test.includes("..")) {
      throw new Error(`${label}.replay.test must be a repository test file`);
    }
    if (replay.target !== "reference" && replay.target !== "production") {
      throw new Error(`${label}.replay.target must be reference or production`);
    }
    if (!Array.isArray(model.mutants) || model.mutants.length === 0 || model.mutants.length > 32) {
      throw new Error(`${label}.mutants must list at least one seeded defect`);
    }
    const invariants = uniqueIdentifiers(model.invariants, `${label}.invariants`);
    const step = identifier(model.step, `${label}.step`);
    const mutants = model.mutants.map((mutant, mutantIndex) => {
      const fields = exactObject(mutant, ["step", "invariant"], `${label}.mutants[${String(mutantIndex)}]`);
      const mutantStep = identifier(fields.step, `${label}.mutants[${String(mutantIndex)}].step`);
      if (mutantStep === step) throw new Error(`${label}.mutants[${String(mutantIndex)}] must use a mutant step`);
      const invariant = identifier(fields.invariant, `${label}.mutants[${String(mutantIndex)}].invariant`);
      if (!invariants.includes(invariant)) {
        throw new Error(`${label}.mutants[${String(mutantIndex)}] must violate one of the model's invariants`);
      }
      return Object.freeze({ step: mutantStep, invariant });
    });
    return Object.freeze({
      file: model.file,
      module: identifier(model.module, `${label}.module`),
      init: identifier(model.init, `${label}.init`),
      step,
      invariants,
      simulation: Object.freeze({
        seed: decimalSeed(simulation.seed, `${label}.simulation.seed`),
        maxSamples: boundedInteger(simulation.maxSamples, 1, 100_000, `${label}.simulation.maxSamples`),
        maxSteps: boundedInteger(simulation.maxSteps, 1, 100, `${label}.simulation.maxSteps`),
      }),
      apalache: Object.freeze({ length: boundedInteger(apalache.length, 1, 50, `${label}.apalache.length`) }),
      mutants: Object.freeze(mutants),
      replay: Object.freeze({
        test: replay.test,
        target: replay.target,
        traces: boundedInteger(replay.traces, 1, 10_000, `${label}.replay.traces`),
        seed: decimalSeed(replay.seed, `${label}.replay.seed`),
        maxSteps: boundedInteger(replay.maxSteps, 1, 100, `${label}.replay.maxSteps`),
      }),
    });
  });
  const files = models.map((model) => model.file);
  if (new Set(files).size !== files.length) throw new Error("models.json must not list a model twice");
  return Object.freeze(models);
}

export async function readQuintModels(root: string = REPOSITORY_ROOT): Promise<readonly QuintModel[]> {
  return parseQuintModels(JSON.parse(await readFile(join(root, "verification/quint/models.json"), "utf8")) as unknown);
}

/** The `quint run` arguments for one seeded simulation. */
export function quintRunArguments(model: QuintModel, step: string, invariant: string): readonly string[] {
  return [
    "run",
    "--backend", "typescript",
    "--main", model.module,
    "--init", model.init,
    "--step", step,
    "--invariant", invariant,
    "--max-samples", String(model.simulation.maxSamples),
    "--max-steps", String(model.simulation.maxSteps),
    "--seed", model.simulation.seed,
    model.file,
  ];
}

/** The `quint run --mbt` arguments that write a model's replay traces into `directory`. */
export function quintTraceArguments(
  model: QuintModel,
  step: string,
  traces: number,
  seed: string,
  directory: string,
): readonly string[] {
  return [
    "run",
    "--backend", "typescript",
    "--main", model.module,
    "--init", model.init,
    "--step", step,
    "--max-samples", String(traces),
    "--max-steps", String(model.replay.maxSteps),
    "--seed", seed,
    "--mbt",
    "--n-traces", String(traces),
    "--out-itf", join(directory, "trace_{seq}.itf.json"),
    model.file,
  ];
}

// ---------------------------------------------------------------------------
// Lean trust base
// ---------------------------------------------------------------------------

export const KERNEL_AXIOMS: readonly string[] = Object.freeze(["propext", "Classical.choice", "Quot.sound"]);
/** Axioms that no allow-list may admit: they mark `sorry` or trusted native evaluation. */
export const FORBIDDEN_AXIOMS: readonly string[] = Object.freeze([
  "sorryAx",
  "Lean.ofReduceBool",
  "Lean.ofReduceNat",
  "Lean.trustCompiler",
]);

export type LeanMutant = Readonly<{
  /** The required theorem whose property the seeded defect breaks. */
  theorem: string;
  /** The definition the theorem states its property about, which the defect stands in for. */
  guarded: string;
  /** The seeded defect: a definition with the guarded definition's type that reproduces the pre-fix behaviour. */
  defect: string;
  /**
   * A required theorem whose statement is exactly the negation of the
   * theorem's statement with the guarded definition replaced by the defect.
   */
  refutation: string;
}>;

export type LeanTheorem = Readonly<{
  name: string;
  /** SHA-256 of the kernel type that `AxiomAudit.lean` prints, so a changed statement needs review. */
  type: string;
}>;

export type LeanProofs = Readonly<{
  library: string;
  theorems: readonly LeanTheorem[];
  mutants: readonly LeanMutant[];
  allowedAxioms: readonly string[];
}>;

const LEAN_NAME = /^[A-Za-z_][A-Za-z0-9_']*(?:\.[A-Za-z_][A-Za-z0-9_']*)*$/u;

/** Parse `verification/lean/proofs.json`. */
export function parseLeanProofs(value: unknown): LeanProofs {
  const manifest = exactObject(value, ["schema", "library", "theorems", "mutants", "allowedAxioms"], "proofs.json");
  if (manifest.schema !== "ghostget-lean-proofs-v2") throw new Error("proofs.json has an unknown schema");
  if (typeof manifest.library !== "string" || !/^[A-Z][A-Za-z0-9]*$/u.test(manifest.library)) {
    throw new Error("proofs.json library must be one Lean module root");
  }
  const library = manifest.library;
  const names = (entry: unknown, label: string, nonEmpty: boolean): readonly string[] => {
    if (!Array.isArray(entry) || (nonEmpty && entry.length === 0) || entry.length > 10_000) {
      throw new Error(`proofs.json ${label} must be a${nonEmpty ? " non-empty" : ""} list`);
    }
    const items = entry.map((item) => {
      if (typeof item !== "string" || !LEAN_NAME.test(item)) throw new Error(`proofs.json ${label} must hold Lean names`);
      return item;
    });
    if (new Set(items).size !== items.length) throw new Error(`proofs.json ${label} must not repeat a name`);
    return Object.freeze(items);
  };
  if (!Array.isArray(manifest.theorems) || manifest.theorems.length === 0 || manifest.theorems.length > 10_000) {
    throw new Error("proofs.json theorems must be a non-empty list");
  }
  const theorems = Object.freeze(manifest.theorems.map((entry, index): LeanTheorem => {
    const label = `proofs.json theorems[${String(index)}]`;
    const theorem = exactObject(entry, ["name", "type"], label);
    if (typeof theorem.name !== "string" || !LEAN_NAME.test(theorem.name)) throw new Error(`${label}.name must be a Lean name`);
    if (!theorem.name.startsWith(`${library}.`)) throw new Error("proofs.json theorems must live in the audited library");
    if (typeof theorem.type !== "string" || !/^[0-9a-f]{64}$/u.test(theorem.type)) {
      throw new Error(`${label}.type must be the SHA-256 hex digest of the theorem's kernel type`);
    }
    return Object.freeze({ name: theorem.name, type: theorem.type });
  }));
  const theoremNames = theorems.map((theorem) => theorem.name);
  if (new Set(theoremNames).size !== theoremNames.length) throw new Error("proofs.json theorems must not repeat a name");
  if (!Array.isArray(manifest.mutants) || manifest.mutants.length === 0 || manifest.mutants.length > 1_000) {
    throw new Error("proofs.json mutants must list at least one seeded defect");
  }
  const mutants = manifest.mutants.map((entry, index): LeanMutant => {
    const label = `proofs.json mutants[${String(index)}]`;
    const mutant = exactObject(entry, ["theorem", "guarded", "defect", "refutation"], label);
    const [theorem, guarded, defect, refutation] = [mutant.theorem, mutant.guarded, mutant.defect, mutant.refutation].map((name) => {
      if (typeof name !== "string" || !LEAN_NAME.test(name) || !name.startsWith(`${library}.`)) {
        throw new Error(`${label} must name declarations in the audited library`);
      }
      return name;
    }) as [string, string, string, string];
    if (!theoremNames.includes(theorem) || !theoremNames.includes(refutation) || theorem === refutation) {
      throw new Error(`${label} must name two different required theorems`);
    }
    if (theoremNames.includes(defect)) throw new Error(`${label} defect must be a definition, not a required theorem`);
    if (theoremNames.includes(guarded)) throw new Error(`${label} guarded must be a definition, not a required theorem`);
    if (guarded === defect) throw new Error(`${label} defect must differ from the definition it stands in for`);
    return Object.freeze({ theorem, guarded, defect, refutation });
  });
  const allowedAxioms = names(manifest.allowedAxioms, "allowedAxioms", false);
  if (allowedAxioms.some((name) => FORBIDDEN_AXIOMS.includes(name) || KERNEL_AXIOMS.includes(name))) {
    throw new Error("proofs.json allowedAxioms may not list sorryAx, native-evaluation axioms, or the kernel axioms");
  }
  return Object.freeze({ library, theorems, mutants: Object.freeze(mutants), allowedAxioms });
}

/** Words that mark a Lean trust escape wherever they appear, comments included. */
const LEAN_TRUST_ESCAPES = Object.freeze([
  "skipKernelTC",
  "implemented_by",
  "native_decide",
  "ofReduceBool",
  "ofReduceNat",
  "trustCompiler",
  "addDeclWithoutChecking",
  "sorryAx",
]);
/** Keywords that library code may not use. */
const LEAN_FORBIDDEN_CODE = Object.freeze([
  "sorry",
  "admit",
  "unsafe",
  "extern",
  "#eval",
  "#exit",
  "run_cmd",
  "run_elab",
  "run_meta",
  "run_tac",
  "elab",
  "elab_rules",
  "initialize",
  "builtin_initialize",
]);
const LEAN_ALLOWED_IMPORT_ROOTS = Object.freeze(["Init", "Std"]);
const LEAN_IDENTIFIER_CHARACTER = /[\p{L}\p{N}_'!?]/u;

function isLeanIdentifierCharacter(character: string | undefined): boolean {
  return character !== undefined && LEAN_IDENTIFIER_CHARACTER.test(character);
}

/**
 * Blank Lean comments while keeping string and character literals and line
 * breaks, so a forbidden word inside a string still counts.
 */
export function leanCodeWithoutComments(text: string): Readonly<{ code: string; problems: readonly string[] }> {
  const problems: string[] = [];
  let code = "";
  let index = 0;
  const blank = (character: string): string => character === "\n" ? "\n" : " ";
  while (index < text.length) {
    const character = text[index]!;
    const next = text[index + 1];
    if (character === "-" && next === "-") {
      while (index < text.length && text[index] !== "\n") {
        code += " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "-") {
      let depth = 1;
      code += "  ";
      index += 2;
      while (index < text.length && depth > 0) {
        if (text[index] === "/" && text[index + 1] === "-") {
          depth += 1;
          code += "  ";
          index += 2;
        } else if (text[index] === "-" && text[index + 1] === "/") {
          depth -= 1;
          code += "  ";
          index += 2;
        } else {
          code += blank(text[index]!);
          index += 1;
        }
      }
      if (depth > 0) problems.push("an unterminated block comment");
      continue;
    }
    if (character === "\"") {
      const start = index;
      index += 1;
      while (index < text.length && text[index] !== "\"") index += text[index] === "\\" ? 2 : 1;
      if (index >= text.length) {
        problems.push("an unterminated string literal");
        code += text.slice(start);
        break;
      }
      index += 1;
      code += text.slice(start, index);
      continue;
    }
    if (character === "r" && !isLeanIdentifierCharacter(text[index - 1])) {
      const raw = /^r(#*)"/u.exec(text.slice(index, index + 260));
      if (raw !== null) {
        const close = `"${raw[1]!}`;
        const end = text.indexOf(close, index + raw[0].length);
        if (end < 0) {
          problems.push("an unterminated raw string literal");
          code += text.slice(index);
          break;
        }
        code += text.slice(index, end + close.length);
        index = end + close.length;
        continue;
      }
    }
    if (character === "'" && !isLeanIdentifierCharacter(text[index - 1])) {
      const literal = /^'(?:\\(?:[\\"'nrt]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\})|[^'\\\n])'/u.exec(text.slice(index, index + 16));
      if (literal !== null) {
        code += literal[0];
        index += literal[0].length;
        continue;
      }
    }
    code += character;
    index += 1;
  }
  return Object.freeze({ code, problems: Object.freeze(problems) });
}

function wordPattern(word: string): RegExp {
  const prefix = /^[A-Za-z_]/u.test(word) ? "(?<![\\p{L}\\p{N}_'!?])" : "";
  return new RegExp(`${prefix}${escapeRegExp(word)}(?![\\p{L}\\p{N}_'!?])`, "u");
}

/**
 * Scan one Lean library source for trust escapes. Findings name the rule, not
 * the source text. The kernel-level axiom audit remains the authority; this
 * scan catches escapes the audit cannot see, such as disabled kernel checks.
 */
export function leanSourceFindings(text: string, proofs: LeanProofs): readonly string[] {
  const findings: string[] = [];
  for (const word of LEAN_TRUST_ESCAPES) {
    if (wordPattern(word).test(text)) findings.push(`uses the trust escape ${word}`);
  }
  const { code, problems } = leanCodeWithoutComments(text);
  findings.push(...problems.map((problem) => `has ${problem}`));
  for (const word of LEAN_FORBIDDEN_CODE) {
    if (wordPattern(word).test(code)) findings.push(`uses ${word}`);
  }
  if (/\+native(?![\p{L}\p{N}_'!?])/u.test(code)) findings.push("uses native evaluation");
  for (const match of code.matchAll(/(?<![\p{L}\p{N}_'!?])axiom\s+([^\s:({[]+)/gu)) {
    const name = match[1]!;
    const allowed = proofs.allowedAxioms.some((axiom) => axiom === name || axiom.endsWith(`.${name}`));
    if (!allowed) findings.push("declares an axiom that proofs.json does not allow");
  }
  if (/(?<![\p{L}\p{N}_'!?])axiom(?![\p{L}\p{N}_'!?])\s*$/mu.test(code)) {
    findings.push("declares an axiom that proofs.json does not allow");
  }
  for (const line of code.split("\n")) {
    const declaration = /^\s*(?:(?:public|private|meta)\s+)*import\s+(.*)$/u.exec(line);
    if (declaration === null) continue;
    for (const module of declaration[1]!.trim().split(/\s+/u)) {
      if (module === "all" || module === "") continue;
      const root = module.split(".")[0]!;
      if (root !== proofs.library && !LEAN_ALLOWED_IMPORT_ROOTS.includes(root)) {
        findings.push(`imports ${module}, outside the core-only allow-list`);
      }
    }
  }
  return Object.freeze([...new Set(findings)]);
}

export type AuditedDeclaration = Readonly<{
  declaration: string;
  kind: string;
  module: string;
  /** The kernel type as `Expr.dbgToString` prints it. */
  type: string;
  axioms: readonly string[];
  /** The constants the declaration's type uses. */
  uses: readonly string[];
}>;

/** One seeded-defect check that `AxiomAudit.lean` ran at the kernel-term level. */
export type AuditedMutant = Readonly<{
  theorem: string;
  guarded: string;
  defect: string;
  refutation: string;
  /** All four declarations exist. */
  found: boolean;
  /** The defect has the guarded definition's type and universe parameters. */
  sameSignature: boolean;
  /** The refutation states exactly the negation of the theorem with the guarded definition replaced by the defect. */
  negates: boolean;
}>;

export type AxiomAudit = Readonly<{
  declarations: readonly AuditedDeclaration[];
  mutants: readonly AuditedMutant[];
}>;

/** The `AxiomAudit.lean` arguments: the library root, then each mutant's four names. */
export function axiomAuditArguments(proofs: LeanProofs): readonly string[] {
  return [proofs.library, ...proofs.mutants.flatMap((mutant) => [mutant.theorem, mutant.guarded, mutant.defect, mutant.refutation])];
}

/** SHA-256 of a theorem's printed kernel type, as `proofs.json` records it. */
export function leanTypeDigest(type: string): string {
  return createHash("sha256").update(type).digest("hex");
}

const DECLARATION_KINDS = new Set([
  "axiom", "definition", "theorem", "opaque", "quotient", "inductive", "constructor", "recursor",
]);

/** Parse the JSON lines that `AxiomAudit.lean` prints. */
export function parseAxiomAudit(stdout: string): AxiomAudit {
  const entries = stdout.split("\n").filter((line) => line.trim() !== "");
  const summaryLine = entries.pop();
  if (summaryLine === undefined) throw new Error("The axiom audit printed nothing");
  let summary: Record<string, unknown>;
  try {
    summary = exactObject(JSON.parse(summaryLine) as unknown, ["declarations", "mutants"], "axiom audit summary");
  } catch {
    throw new Error("The axiom audit did not end with its summary line");
  }
  const total = summary.declarations;
  const checks = summary.mutants;
  if (typeof total !== "number" || typeof checks !== "number" || !Number.isSafeInteger(checks) || checks < 0
    || total + checks !== entries.length || total === 0) {
    throw new Error("The axiom audit summary does not match its declarations");
  }
  const parsedLine = (line: string, index: number): unknown => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Axiom audit line ${String(index + 1)} is not JSON`);
    }
  };
  const strings = (list: unknown): list is string[] =>
    Array.isArray(list) && list.every((item) => typeof item === "string" && item !== "");
  const declarations = entries.slice(0, total).map((line, index): AuditedDeclaration => {
    const entry = exactObject(parsedLine(line, index), ["declaration", "kind", "module", "type", "axioms", "uses"], `axiom audit line ${String(index + 1)}`);
    if (typeof entry.declaration !== "string" || entry.declaration === "" || typeof entry.module !== "string"
      || typeof entry.kind !== "string" || !DECLARATION_KINDS.has(entry.kind)
      || typeof entry.type !== "string" || entry.type === ""
      || !strings(entry.axioms) || !strings(entry.uses)) {
      throw new Error(`Axiom audit line ${String(index + 1)} is malformed`);
    }
    return Object.freeze({
      declaration: entry.declaration,
      kind: entry.kind,
      module: entry.module,
      type: entry.type,
      axioms: Object.freeze([...entry.axioms]),
      uses: Object.freeze([...entry.uses]),
    });
  });
  const mutants = entries.slice(total).map((line, offset): AuditedMutant => {
    const index = total + offset;
    const label = `axiom audit line ${String(index + 1)}`;
    const entry = exactObject(parsedLine(line, index), [
      "mutant", "guarded", "defect", "refutation", "found", "sameSignature", "negates",
    ], label);
    const names = [entry.mutant, entry.guarded, entry.defect, entry.refutation];
    if (!names.every((name) => typeof name === "string" && name !== "")
      || typeof entry.found !== "boolean" || typeof entry.sameSignature !== "boolean" || typeof entry.negates !== "boolean") {
      throw new Error(`Axiom audit line ${String(index + 1)} is malformed`);
    }
    const [theorem, guarded, defect, refutation] = names as [string, string, string, string];
    return Object.freeze({
      theorem, guarded, defect, refutation, found: entry.found, sameSignature: entry.sameSignature, negates: entry.negates,
    });
  });
  const declared = declarations.map((entry) => entry.declaration);
  if (new Set(declared).size !== declared.length) throw new Error("The axiom audit repeats a declaration");
  return Object.freeze({ declarations: Object.freeze(declarations), mutants: Object.freeze(mutants) });
}

/**
 * Findings for an audited library: missing or changed theorems, unlisted or
 * forbidden axioms, and seeded defects whose refutation is not, at the
 * kernel-term level, the negation of the guarded theorem with the defect in
 * place of the definition it guards.
 */
export function axiomAuditFindings(audit: AxiomAudit, proofs: LeanProofs): readonly string[] {
  const findings: string[] = [];
  const { declarations } = audit;
  const allowed = new Set([...KERNEL_AXIOMS, ...proofs.allowedAxioms]);
  const byName = new Map(declarations.map((entry) => [entry.declaration, entry]));
  for (const theorem of proofs.theorems) {
    const entry = byName.get(theorem.name);
    if (entry === undefined) findings.push(`${theorem.name} is missing`);
    else if (entry.kind !== "theorem") findings.push(`${theorem.name} is a ${entry.kind}, not a theorem`);
    else if (leanTypeDigest(entry.type) !== theorem.type) {
      findings.push(`${theorem.name} states something other than proofs.json records; review it and set its type to ${leanTypeDigest(entry.type)}`);
    }
  }
  for (const mutant of proofs.mutants) {
    for (const [role, name] of [["seeded defect", mutant.defect], ["guarded definition", mutant.guarded]] as const) {
      const entry = byName.get(name);
      if (entry === undefined) findings.push(`the ${role} ${name} is missing`);
      else if (entry.kind !== "definition") findings.push(`the ${role} ${name} is ${/^[aeiou]/u.test(entry.kind) ? "an" : "a"} ${entry.kind}, not a definition`);
    }
    const theorem = byName.get(mutant.theorem);
    if (theorem?.uses.includes(mutant.defect) === true) {
      findings.push(`${mutant.theorem} states its property about the seeded defect ${mutant.defect}`);
    }
    if (theorem?.uses.includes(mutant.guarded) === false) {
      findings.push(`${mutant.theorem} does not state anything about ${mutant.guarded}`);
    }
    if (byName.get(mutant.refutation)?.uses.includes(mutant.defect) === false) {
      findings.push(`${mutant.refutation} does not state anything about the seeded defect ${mutant.defect}`);
    }
    const checks = audit.mutants.filter((check) => check.theorem === mutant.theorem && check.guarded === mutant.guarded
      && check.defect === mutant.defect && check.refutation === mutant.refutation);
    if (checks.length !== 1) {
      findings.push(`the audit checked the seeded defect ${mutant.defect} against ${mutant.theorem} ${String(checks.length)} times, not once`);
      continue;
    }
    const check = checks[0]!;
    if (!check.found) {
      findings.push(`the audit could not find every declaration of the seeded defect ${mutant.defect}`);
      continue;
    }
    if (!check.sameSignature) findings.push(`the seeded defect ${mutant.defect} does not have the type of ${mutant.guarded}`);
    if (!check.negates) {
      findings.push(`${mutant.refutation} does not state the negation of ${mutant.theorem} with ${mutant.guarded} replaced by ${mutant.defect}`);
    }
  }
  if (audit.mutants.length !== proofs.mutants.length) {
    findings.push(`the audit checked ${String(audit.mutants.length)} seeded defects, but proofs.json lists ${String(proofs.mutants.length)}`);
  }
  for (const entry of declarations) {
    if (entry.module !== proofs.library && !entry.module.startsWith(`${proofs.library}.`)) {
      findings.push(`${entry.declaration} comes from ${entry.module}, outside ${proofs.library}`);
    }
    if (entry.kind === "axiom" && !proofs.allowedAxioms.includes(entry.declaration)) {
      findings.push(`${entry.declaration} is an axiom that proofs.json does not allow`);
    }
    for (const axiom of entry.axioms) {
      if (FORBIDDEN_AXIOMS.includes(axiom)) findings.push(`${entry.declaration} depends on ${axiom}`);
      else if (!allowed.has(axiom)) findings.push(`${entry.declaration} depends on the unlisted axiom ${axiom}`);
    }
  }
  return Object.freeze(findings);
}

/** Static checks on the Lake project: the pinned toolchain, no packages, and no build options. */
export function leanProjectFindings(files: Readonly<{
  toolchain: string;
  manifest: string;
  lakefile: string;
}>): readonly string[] {
  const findings: string[] = [];
  if (files.toolchain !== `${LEAN.toolchain}\n`) findings.push(`lean-toolchain must be exactly ${LEAN.toolchain}`);
  try {
    const manifest = JSON.parse(files.manifest) as unknown;
    if (!isPlainObject(manifest) || !Array.isArray(manifest.packages) || manifest.packages.length !== 0) {
      findings.push("lake-manifest.json must list no packages");
    }
  } catch {
    findings.push("lake-manifest.json must be JSON");
  }
  for (const word of LEAN_TRUST_ESCAPES) {
    if (wordPattern(word).test(files.lakefile)) findings.push(`lakefile.toml uses the trust escape ${word}`);
  }
  try {
    const lakefile = Bun.TOML.parse(files.lakefile) as Record<string, unknown>;
    const top = Object.keys(lakefile).sort();
    if (top.join(",") !== "defaultTargets,lean_lib,name") {
      findings.push("lakefile.toml may set only name, defaultTargets, and lean_lib");
    }
    const libraries = lakefile.lean_lib;
    if (!Array.isArray(libraries) || libraries.length !== 1 || !isPlainObject(libraries[0])
      || Object.keys(libraries[0]).some((key) => !["name", "roots", "globs"].includes(key))) {
      findings.push("lakefile.toml must declare one lean_lib with only name, roots, and globs");
    }
  } catch {
    findings.push("lakefile.toml must be TOML");
  }
  return Object.freeze(findings);
}

// ---------------------------------------------------------------------------
// Sanitized logs
// ---------------------------------------------------------------------------

export type PathReplacement = readonly [prefix: string, placeholder: string];

/* eslint-disable no-control-regex -- terminal control sequences are removed on purpose. */
const TERMINAL_SEQUENCES = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[@-_]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;
/* eslint-enable no-control-regex */

/**
 * Remove terminal controls and every C0 and C1 control character except line
 * feed and tab, replace local absolute paths with placeholders, longest first,
 * and neutralize the source-CI markers that job-log admission counts.
 */
export function sanitizeCheckerOutput(text: string, replacements: readonly PathReplacement[]): string {
  let output = text.replace(/\r\n/gu, "\n").replace(TERMINAL_SEQUENCES, "").replace(CONTROL_CHARACTERS, "");
  const ordered = [...replacements]
    .filter(([prefix]) => prefix.length > 1)
    .sort((left, right) => right[0].length - left[0].length);
  for (const [prefix, placeholder] of ordered) output = output.split(prefix).join(placeholder);
  return output
    .split("WRENCH_SOURCE_CI_IDENTITY=").join("<source-ci-marker>")
    .split("[command]").join("<command>");
}

export async function pathReplacements(entries: readonly PathReplacement[]): Promise<readonly PathReplacement[]> {
  const all: PathReplacement[] = [];
  for (const [prefix, placeholder] of entries) {
    all.push([prefix, placeholder]);
    try {
      const real = await realpath(prefix);
      if (real !== prefix) all.push([real, placeholder]);
    } catch {
      // A path that does not exist has no other spelling to replace.
    }
  }
  return all;
}

function tail(text: string): string {
  const all = text.trimEnd().split("\n");
  return all.slice(-FAILURE_TAIL_LINES).join("\n");
}

// ---------------------------------------------------------------------------
// Checker runs
// ---------------------------------------------------------------------------

type RunContext = Readonly<{
  root: string;
  work: string;
  artifacts: string;
  cacheDirectory: string;
  platform: PlatformKey;
  replacements: readonly PathReplacement[];
  log: (line: string) => void;
}>;

function sanitize(context: RunContext, text: string): string {
  return sanitizeCheckerOutput(text, context.replacements);
}

/** Keeps only the lines of a checker's output that are safe and useful to retain. */
export type OutputFilter = (text: string) => string;

/** A finished checker run plus the sanitized record written to its log. */
type LoggedResult = CheckerResult & Readonly<{ record: string }>;

async function runLogged(
  context: RunContext,
  step: string,
  logName: string,
  command: readonly string[],
  options: ToolRunOptions,
  filter: OutputFilter = (text) => text,
): Promise<LoggedResult> {
  const outcome = await runTool(command, options);
  const status = outcome.kind === "exited" ? `exit ${String(outcome.exitCode)}` : `${outcome.kind}: ${outcome.detail}`;
  const record = sanitize(context, [
    `$ ${command.join(" ")}`,
    `# ${status}`,
    "## stdout",
    filter(outcome.stdout),
    "## stderr",
    filter(outcome.stderr),
    "",
  ].join("\n"));
  await writeFile(join(context.artifacts, `${logName}.log`), record, { mode: 0o644 });
  try {
    return { ...requireFinished(step, outcome), record };
  } catch (error) {
    context.log(tail(record));
    throw error;
  }
}

/**
 * `requireVerdict` for a logged run. CI retains checker logs only after a
 * successful run, so a rejected verdict prints the tail of its sanitized log.
 */
function requireLoggedVerdict(
  context: RunContext,
  step: string,
  expected: "pass" | "violation",
  verdict: CheckerVerdict,
  result: LoggedResult,
): void {
  try {
    requireVerdict(step, expected, verdict);
  } catch (error) {
    context.log(tail(result.record));
    throw error;
  }
}

function toolEnvironment(context: RunContext, extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return Object.freeze({
    HOME: join(context.work, "home"),
    TMPDIR: join(context.work, "tmp"),
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    PATH: "/usr/bin:/bin",
    ...extra,
  });
}

function requireExecutable(name: string): string {
  const found = Bun.which(name);
  if (found === null) throw new Error(`${name} must be on PATH for the formal-verification checkers`);
  return found;
}

async function extractArchive(
  context: RunContext,
  archivePath: string,
  archive: PinnedArchive,
  destination: string,
  extractedName: string,
): Promise<string> {
  await mkdir(destination, { recursive: true });
  const staging = await mkdtemp(join(destination, ".extract-"));
  const tar = requireExecutable("tar");
  const flags = archive.format === "tar.gz" ? ["-xzf"] : ["--zstd", "-xf"];
  const zstdDirectory = archive.format === "tar.zst" ? `${dirname(requireExecutable("zstd"))}:` : "";
  const result = await runLogged(context, `extract ${archive.name}`, `extract-${archive.entry}`, [
    tar, ...flags, archivePath, "-C", staging,
  ], {
    cwd: context.work,
    environment: toolEnvironment(context, { PATH: `${zstdDirectory}/usr/bin:/bin` }),
    timeoutMs: EXTRACT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) throw new Error(`extract ${archive.name}: tar exited with ${String(result.exitCode)}`);
  const entries = await readdir(staging);
  if (entries.length !== 1 || entries[0] !== archive.entry) {
    throw new Error(`${archive.name} must contain exactly the top-level entry ${archive.entry}`);
  }
  const target = join(destination, extractedName);
  await rename(join(staging, archive.entry), target);
  await rm(staging, { recursive: true, force: true });
  return target;
}

async function admitAll(context: RunContext, archives: readonly PinnedArchive[]): Promise<readonly string[]> {
  return Promise.all(archives.map((archive) => admitArchive(archive, {
    cacheDirectory: context.cacheDirectory,
    log: context.log,
  })));
}

async function prepareJdk(context: RunContext, archivePath: string): Promise<Readonly<{ java: string; home: string }>> {
  const archive = JDK.archives[context.platform];
  const extracted = await extractArchive(context, archivePath, archive, join(context.work, "tools"), "jdk");
  const home = context.platform.startsWith("darwin") ? join(extracted, "Contents", "Home") : extracted;
  const java = join(home, "bin", "java");
  const result = await runLogged(context, "java -version", "jdk-identity", [
    java, "-XshowSettings:properties", "-version",
  ], {
    cwd: context.work,
    environment: toolEnvironment(context, { JAVA_HOME: home }),
    timeoutMs: SHORT_TIMEOUT_MS,
  }, jdkIdentityLines);
  if (result.exitCode !== 0 || !jdkIdentityMatches(result.stderr)) {
    throw new Error(`The extracted JDK is not ${JDK.vendorVersion} (${JDK.runtimeVersion})`);
  }
  return { java, home };
}

const JDK_IDENTITY = Object.freeze([
  ["java.runtime.version", JDK.runtimeVersion],
  ["java.vendor", JDK.vendor],
  ["java.vendor.version", JDK.vendorVersion],
] as const);

const jdkPropertyLine = (name: string): RegExp => new RegExp(`^\\s*${escapeRegExp(name)} = (.*)$`, "u");

/**
 * Keep only the JDK identity lines of `java -XshowSettings:properties -version`.
 * The full property dump names the local user and home directory.
 */
export function jdkIdentityLines(text: string): string {
  return lines(text)
    .filter((line) => JDK_IDENTITY.some(([name]) => jdkPropertyLine(name).test(line))
      || /^(?:openjdk version |OpenJDK Runtime Environment |OpenJDK 64-Bit Server VM )/u.test(line))
    .join("\n");
}

/** True only when each pinned identity property appears exactly once with its pinned value. */
export function jdkIdentityMatches(text: string): boolean {
  return JDK_IDENTITY.every(([name, expected]) => {
    const values = lines(text)
      .map((line) => jdkPropertyLine(name).exec(line)?.[1])
      .filter((value) => value !== undefined);
    return values.length === 1 && values[0] === expected;
  });
}

async function quintVersion(context: RunContext, node: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(context.root, "node_modules", QUINT.packageName, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (manifest.version !== QUINT.version) throw new Error(`Installed Quint is not ${QUINT.version}; run bun install`);
  const result = await runLogged(context, "quint --version", "quint-version", [node, join(context.root, QUINT.cli), "--version"], {
    cwd: context.work,
    environment: quintEnvironment(context, node),
    timeoutMs: SHORT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0 || result.stdout.trim() !== QUINT.version) {
    throw new Error(`The Quint CLI does not report version ${QUINT.version}`);
  }
  return result.stdout.trim();
}

function quintEnvironment(context: RunContext, node: string): Readonly<Record<string, string>> {
  return toolEnvironment(context, {
    PATH: `${dirname(node)}:/usr/bin:/bin`,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  });
}

/**
 * Typecheck every model, require each invariant to pass seeded simulation and
 * bounded Apalache checking, and require both checkers to find every mutant.
 */
export async function verifyQuint(context: RunContext): Promise<void> {
  const models = await readQuintModels(context.root);
  const node = requireExecutable("node");
  const quint = join(context.root, QUINT.cli);
  const quintDirectory = join(context.root, "verification", "quint");
  const version = await quintVersion(context, node);
  const [apalachePath, jdkPath] = await admitAll(context, [APALACHE.archive, JDK.archives[context.platform]]);
  const jdk = await prepareJdk(context, jdkPath!);
  const apalache = await extractArchive(context, apalachePath!, APALACHE.archive, join(context.work, "tools"), "apalache");
  const apalacheJar = join(apalache, "lib", "apalache.jar");
  const irDirectory = join(context.work, "quint-ir");
  await mkdir(irDirectory, { recursive: true });
  const quintRun = (step: string, logName: string, argumentsList: readonly string[]) =>
    runLogged(context, step, logName, [node, quint, ...argumentsList], {
      cwd: quintDirectory,
      environment: quintEnvironment(context, node),
      timeoutMs: QUINT_TIMEOUT_MS,
    });
  const apalacheRun = async (
    step: string,
    logName: string,
    model: QuintModel,
    ir: string,
    next: string,
    invariant: string,
  ) => {
    const outDirectory = await mkdtemp(join(context.work, "apalache-out-"));
    const result = await runLogged(context, step, logName, [
      jdk.java,
      "-Xmx4096m",
      "-XX:+UseG1GC",
      `-Djava.io.tmpdir=${join(context.work, "tmp")}`,
      "-jar", apalacheJar,
      "check",
      `--length=${String(model.apalache.length)}`,
      `--init=${model.init}`,
      `--next=${next}`,
      `--inv=${invariant}`,
      `--out-dir=${outDirectory}`,
      ir,
    ], {
      cwd: context.work,
      environment: toolEnvironment(context, { JAVA_HOME: jdk.home }),
      timeoutMs: APALACHE_TIMEOUT_MS,
    });
    return { result, outDirectory };
  };
  const summary: Record<string, unknown>[] = [];
  for (const model of models) {
    const name = model.module;
    const typecheck = await quintRun(`quint typecheck ${model.file}`, `quint-typecheck-${name}`, ["typecheck", model.file]);
    requireLoggedVerdict(context, `quint typecheck ${model.file}`, "pass", quintTypecheckVerdict(typecheck), typecheck);
    for (const invariant of model.invariants) {
      const step = `quint run ${name} ${model.step} ${invariant}`;
      const result = await quintRun(step, `quint-run-${name}-${invariant}`, quintRunArguments(model, model.step, invariant));
      requireLoggedVerdict(context, step, "pass", quintSimulationVerdict(result, model.simulation.seed), result);
      context.log(`${step}: no violation in ${String(model.simulation.maxSamples)} samples of up to ${String(model.simulation.maxSteps)} steps (seed ${model.simulation.seed})`);
    }
    for (const mutant of model.mutants) {
      const step = `quint run ${name} ${mutant.step} ${mutant.invariant}`;
      const result = await quintRun(step, `quint-mutant-${name}-${mutant.step}`, quintRunArguments(model, mutant.step, mutant.invariant));
      requireLoggedVerdict(context, step, "violation", quintSimulationVerdict(result, model.simulation.seed), result);
      context.log(`${step}: the seeded defect violates ${mutant.invariant}, as required`);
    }
    const compiled = await quintRun(`quint compile ${model.file}`, `quint-compile-${name}`, [
      "compile", "--target", "json", "--main", model.module, model.file,
    ]);
    let ir: unknown;
    try {
      ir = JSON.parse(compiled.stdout) as unknown;
    } catch {
      ir = null;
    }
    if (compiled.exitCode !== 0 || !isPlainObject(ir)) throw new Error(`quint compile ${model.file} did not produce its JSON IR`);
    const irPath = join(irDirectory, `${name}.qnt.json`);
    await writeFile(irPath, compiled.stdout);
    for (const invariant of model.invariants) {
      const step = `apalache check ${name} ${model.step} ${invariant}`;
      const { result } = await apalacheRun(step, `apalache-${name}-${invariant}`, model, irPath, model.step, invariant);
      requireLoggedVerdict(context, step, "pass", apalacheVerdict(result, model.apalache.length), result);
      context.log(`${step}: no violation up to length ${String(model.apalache.length)}`);
    }
    for (const mutant of model.mutants) {
      const step = `apalache check ${name} ${mutant.step} ${mutant.invariant}`;
      const { result, outDirectory } = await apalacheRun(
        step, `apalache-mutant-${name}-${mutant.step}`, model, irPath, mutant.step, mutant.invariant,
      );
      requireLoggedVerdict(context, step, "violation", apalacheVerdict(result, model.apalache.length), result);
      const counterexample = await apalacheCounterexample(outDirectory, `${name}.qnt.json`);
      await writeFile(join(context.artifacts, `apalache-mutant-${name}-${mutant.step}.itf.json`), counterexample);
      context.log(`${step}: the seeded defect violates ${mutant.invariant}, as required`);
    }
    summary.push({
      model: model.file,
      invariants: model.invariants,
      mutants: model.mutants.map((mutant) => mutant.step),
      simulation: model.simulation,
      apalache: model.apalache,
      replay: { test: model.replay.test, target: model.replay.target },
    });
  }
  await writeFile(join(context.artifacts, "toolchain.json"), `${JSON.stringify({
    quint: version,
    apalache: `${APALACHE.version} (build ${APALACHE.build})`,
    jdk: `${JDK.vendorVersion} (${JDK.runtimeVersion})`,
    archives: [APALACHE.archive, JDK.archives[context.platform]].map((archive) => ({
      name: archive.name, bytes: archive.bytes, sha256: archive.sha256,
    })),
    models: summary,
  }, null, 2)}\n`);
}

/** Read and strictly parse the single counterexample Apalache wrote for a violation. */
async function apalacheCounterexample(outDirectory: string, irName: string): Promise<string> {
  const runs = await readdir(join(outDirectory, irName));
  if (runs.length !== 1) throw new Error("Apalache must write exactly one run directory");
  const path = join(outDirectory, irName, runs[0]!, "violation1.itf.json");
  const text = await readFile(path, "utf8");
  const trace = parseItfTrace(text);
  if (trace.states.length < 2) throw new Error("The Apalache counterexample must reach a violating state");
  return text;
}

async function listLeanSources(directory: string, base: string = directory): Promise<readonly string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".lake") continue;
      found.push(...await listLeanSources(path, base));
    } else if (entry.isFile() && entry.name.endsWith(".lean")) {
      found.push(relative(base, path));
    } else if (!entry.isFile()) {
      throw new Error(`verification/lean must hold only files and directories: ${relative(base, path)}`);
    }
  }
  return found.sort();
}

/** Static checks that need no toolchain: project files, the proof list, and the source scan. */
export async function leanStaticFindings(root: string = REPOSITORY_ROOT): Promise<Readonly<{
  proofs: LeanProofs;
  findings: readonly string[];
}>> {
  const project = join(root, "verification", "lean");
  const proofs = parseLeanProofs(JSON.parse(await readFile(join(project, "proofs.json"), "utf8")) as unknown);
  const findings = [...leanProjectFindings({
    toolchain: await readFile(join(project, "lean-toolchain"), "utf8"),
    manifest: await readFile(join(project, "lake-manifest.json"), "utf8"),
    lakefile: await readFile(join(project, "lakefile.toml"), "utf8"),
  })];
  const sources = await listLeanSources(project);
  const library = sources.filter((path) => path !== "AxiomAudit.lean");
  const expectedRoot = `${proofs.library}.lean`;
  if (!library.includes(expectedRoot)) findings.push(`${expectedRoot} is missing`);
  for (const path of library) {
    if (path !== expectedRoot && !path.startsWith(`${proofs.library}${sep}`)) {
      findings.push(`${path} is outside the ${proofs.library} library`);
      continue;
    }
    for (const finding of leanSourceFindings(await readFile(join(project, path), "utf8"), proofs)) {
      findings.push(`${path} ${finding}`);
    }
  }
  return { proofs, findings: Object.freeze(findings) };
}

/**
 * Build the core-only Lake project with warnings as errors on the pinned
 * toolchain, then audit every library declaration's axioms at the kernel.
 */
export async function verifyLean(context: RunContext): Promise<void> {
  const { proofs, findings } = await leanStaticFindings(context.root);
  if (findings.length > 0) throw new Error(`The Lean source scan failed:\n${findings.join("\n")}`);
  requireExecutable("zstd");
  const [elanPath, leanPath] = await admitAll(context, [ELAN.archives[context.platform], LEAN.archives[context.platform]]);
  const elanHome = join(context.work, "elan");
  const elanInit = await extractArchive(context, elanPath!, ELAN.archives[context.platform], join(context.work, "tools"), "elan-init");
  const elanEnvironment = toolEnvironment(context, { ELAN_HOME: elanHome });
  const install = await runLogged(context, "elan-init", "elan-init", [
    elanInit, "-y", "--default-toolchain", "none", "--no-modify-path",
  ], { cwd: context.work, environment: elanEnvironment, timeoutMs: SHORT_TIMEOUT_MS });
  if (install.exitCode !== 0) throw new Error("elan-init did not install elan");
  const elanBinary = join(elanHome, "bin", "elan");
  const elanVersion = await runLogged(context, "elan --version", "elan-version", [elanBinary, "--version"], {
    cwd: context.work, environment: elanEnvironment, timeoutMs: SHORT_TIMEOUT_MS,
  });
  if (elanVersion.exitCode !== 0 || !elanVersion.stdout.startsWith(`elan ${ELAN.version} `)) {
    throw new Error(`The installed elan is not ${ELAN.version}`);
  }
  const toolchain = await extractArchive(
    context, leanPath!, LEAN.archives[context.platform], join(elanHome, "toolchains"), LEAN.toolchainDirectory,
  );
  const listed = await runLogged(context, "elan toolchain list", "elan-toolchains", [elanBinary, "toolchain", "list"], {
    cwd: context.work, environment: elanEnvironment, timeoutMs: SHORT_TIMEOUT_MS,
  });
  const toolchains = lines(listed.stdout).map((line) => line.trim()).filter((line) => line !== "");
  if (listed.exitCode !== 0 || toolchains.length !== 1 || toolchains[0]!.split(/\s+/u)[0] !== LEAN.toolchain) {
    throw new Error(`elan must resolve exactly the seeded ${LEAN.toolchain} toolchain`);
  }
  const project = join(context.work, "project");
  await cp(join(context.root, "verification", "lean"), project, {
    recursive: true,
    filter: (source) => !source.split(sep).includes(".lake"),
  });
  const lake = join(toolchain, "bin", "lake");
  const leanEnvironment = toolEnvironment(context, {
    ELAN_HOME: elanHome,
    PATH: `${join(toolchain, "bin")}:/usr/bin:/bin`,
  });
  const resolved = await runLogged(context, "elan which lake", "elan-which-lake", [elanBinary, "which", "lake"], {
    cwd: project, environment: elanEnvironment, timeoutMs: SHORT_TIMEOUT_MS,
  });
  if (resolved.exitCode !== 0 || resolved.stdout.trim() !== lake) {
    throw new Error(`lean-toolchain must resolve to the seeded ${LEAN.toolchain} toolchain`);
  }
  const leanVersion = await runLogged(context, "lean --version", "lean-version", [join(toolchain, "bin", "lean"), "--version"], {
    cwd: project, environment: leanEnvironment, timeoutMs: SHORT_TIMEOUT_MS,
  });
  if (leanVersion.exitCode !== 0 || !leanVersion.stdout.startsWith(`Lean (version ${LEAN.version},`)) {
    throw new Error(`The seeded toolchain is not Lean ${LEAN.version}`);
  }
  const build = await runLogged(context, "lake build --wfail", "lean-build", [lake, "build", "--wfail"], {
    cwd: project, environment: leanEnvironment, timeoutMs: LEAN_BUILD_TIMEOUT_MS,
  });
  if (build.exitCode !== 0) {
    context.log(tail(sanitize(context, `${build.stdout}\n${build.stderr}`)));
    throw new Error("lake build --wfail failed");
  }
  const audit = await runLogged(context, "axiom audit", "lean-axiom-audit", [
    lake, "env", "lean", "--run", "AxiomAudit.lean", ...axiomAuditArguments(proofs),
  ], { cwd: project, environment: leanEnvironment, timeoutMs: LEAN_BUILD_TIMEOUT_MS });
  if (audit.exitCode !== 0 || audit.stderr.trim() !== "") {
    context.log(tail(sanitize(context, `${audit.stdout}\n${audit.stderr}`)));
    throw new Error("The axiom audit did not finish cleanly");
  }
  const audited = parseAxiomAudit(audit.stdout);
  const { declarations } = audited;
  const auditFindings = axiomAuditFindings(audited, proofs);
  if (auditFindings.length > 0) throw new Error(`The axiom audit failed:\n${auditFindings.join("\n")}`);
  await writeFile(join(context.artifacts, "lean-axiom-audit.jsonl"), sanitize(context, audit.stdout));
  const theorems = declarations.filter((entry) => entry.kind === "theorem").length;
  context.log(`lake build --wfail: ${proofs.library} builds on Lean ${LEAN.version} with warnings as errors`);
  context.log(`axiom audit: ${String(declarations.length)} declarations, ${String(theorems)} theorems, all ${String(proofs.theorems.length)} required theorems present with their recorded statements, only allowed axioms`);
  for (const mutant of proofs.mutants) {
    context.log(`seeded defect ${mutant.defect}: ${mutant.refutation} proves the negation of ${mutant.theorem} with ${mutant.guarded} replaced by ${mutant.defect}`);
  }
  await verifyAuditCanary(context, proofs, lake, leanEnvironment);
  context.log("axiom audit canary: a seeded sorry fails lake build --wfail and the audit reports sorryAx, as required");
  await verifyLeanDifferential(context, lake, project, leanEnvironment);
  context.log(`differential test: ${LEAN_DIFFERENTIAL_TEST} agrees with the Lean definitions on generated inputs, and production rejects every seeded defect's counterexample`);
  await writeFile(join(context.artifacts, "toolchain.json"), `${JSON.stringify({
    elan: elanVersion.stdout.trim().split(" ").slice(0, 2).join(" "),
    lean: sanitize(context, leanVersion.stdout.trim()),
    toolchain: LEAN.toolchain,
    archives: [ELAN.archives[context.platform], LEAN.archives[context.platform]].map((archive) => ({
      name: archive.name, bytes: archive.bytes, sha256: archive.sha256,
    })),
    theorems: proofs.theorems,
    mutants: proofs.mutants,
    allowedAxioms: proofs.allowedAxioms,
  }, null, 2)}\n`);
}

/** The test that runs production TypeScript and the built Lean definitions on the same generated inputs. */
export const LEAN_DIFFERENTIAL_TEST = "scripts/verification-lean-encodings.test.ts";

/** Property replay coordinates the differential test honors, passed through when set. */
const PROPERTY_REPLAY_VARIABLES = ["GHOSTGET_PROPERTY_SEED", "GHOSTGET_PROPERTY_PATH"] as const;

async function verifyLeanDifferential(
  context: RunContext,
  lake: string,
  project: string,
  leanEnvironment: Readonly<Record<string, string>>,
): Promise<void> {
  const replay = Object.fromEntries(PROPERTY_REPLAY_VARIABLES.flatMap((name) => {
    const value = process.env[name];
    return value === undefined || value === "" ? [] : [[name, value]];
  }));
  const run = await runLogged(context, "lean differential test", "lean-differential", [
    process.execPath, "test", "--no-orphans", "--timeout", String(LEAN_BUILD_TIMEOUT_MS), "--max-concurrency", "1",
    `./${LEAN_DIFFERENTIAL_TEST}`,
  ], {
    cwd: context.root,
    environment: { ...leanEnvironment, ...replay, GHOSTGET_LEAN_LAKE: lake, GHOSTGET_LEAN_PROJECT: project },
    timeoutMs: LEAN_BUILD_TIMEOUT_MS,
  });
  if (run.exitCode !== 0) {
    context.log(tail(sanitize(context, `${run.stdout}\n${run.stderr}`)));
    throw new Error(`${LEAN_DIFFERENTIAL_TEST} failed`);
  }
}

/** The module the canary adds to a copy of the library. */
export const LEAN_CANARY_MODULE = "SeededSorryCanary";

/** The canary source: one theorem proved by `sorry`, which every check must reject. */
export function leanCanarySource(library: string): string {
  const namespace = `${library}.${LEAN_CANARY_MODULE}`;
  return `namespace ${namespace}\n\ntheorem canary : False := sorry\n\nend ${namespace}\n`;
}

/**
 * Show that the checks can fail: a copy of the library with a `sorry` theorem
 * must fail `lake build --wfail`, and the audit must report its `sorryAx`.
 */
async function verifyAuditCanary(
  context: RunContext,
  proofs: LeanProofs,
  lake: string,
  environment: Readonly<Record<string, string>>,
): Promise<void> {
  const canary = join(context.work, "canary");
  await cp(join(context.root, "verification", "lean"), canary, {
    recursive: true,
    filter: (source) => !source.split(sep).includes(".lake"),
  });
  const module = `${proofs.library}.${LEAN_CANARY_MODULE}`;
  await writeFile(join(canary, proofs.library, `${LEAN_CANARY_MODULE}.lean`), leanCanarySource(proofs.library));
  const rootFile = join(canary, `${proofs.library}.lean`);
  await writeFile(rootFile, `import ${module}\n${await readFile(rootFile, "utf8")}`);
  const options = { cwd: canary, environment, timeoutMs: LEAN_BUILD_TIMEOUT_MS };
  const strict = await runLogged(context, "canary lake build --wfail", "lean-canary-build-wfail", [lake, "build", "--wfail"], options);
  if (strict.exitCode === 0 || !/declaration uses [`']sorry[`']/u.test(`${strict.stdout}\n${strict.stderr}`)) {
    throw new Error("lake build --wfail accepted the seeded sorry canary, so its pass is not evidence");
  }
  const lenient = await runLogged(context, "canary lake build", "lean-canary-build", [lake, "build"], options);
  if (lenient.exitCode !== 0) throw new Error("The seeded sorry canary did not build without --wfail");
  const audit = await runLogged(context, "canary axiom audit", "lean-canary-axiom-audit", [
    lake, "env", "lean", "--run", "AxiomAudit.lean", ...axiomAuditArguments(proofs),
  ], options);
  if (audit.exitCode !== 0) throw new Error("The axiom audit did not finish on the seeded sorry canary");
  const findings = axiomAuditFindings(parseAxiomAudit(audit.stdout), proofs);
  if (!findings.includes(`${module}.canary depends on sorryAx`)) {
    throw new Error("The axiom audit did not report the seeded sorry canary, so its pass is not evidence");
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export async function runVerification(mode: "quint" | "lean", root: string = REPOSITORY_ROOT): Promise<void> {
  const platform = platformKey();
  const cacheDirectory = verificationCacheDirectory();
  const artifacts = join(root, VERIFICATION_ARTIFACTS, mode);
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), `ghostget-verification-${mode}-`));
  try {
    await mkdir(join(work, "home"), { mode: 0o700 });
    await mkdir(join(work, "tmp"), { mode: 0o700 });
    const toolDirectories = ["node", "zstd"].flatMap((name): PathReplacement[] => {
      const found = Bun.which(name);
      const directory = found === null ? null : dirname(found);
      return directory === null || directory === "/usr/bin" || directory === "/bin" ? [] : [[directory, `<${name}-bin>`]];
    });
    const replacements = await pathReplacements([
      [work, "<work>"],
      [cacheDirectory, "<cache>"],
      [root, "<repository>"],
      ...toolDirectories,
      [tmpdir(), "<tmp>"],
      [homedir(), "<home>"],
    ]);
    const context: RunContext = {
      root,
      work,
      artifacts,
      cacheDirectory,
      platform,
      replacements,
      log: (line) => console.log(sanitizeCheckerOutput(line, replacements)),
    };
    try {
      if (mode === "quint") await verifyQuint(context);
      else await verifyLean(context);
    } catch (error) {
      throw new Error(sanitizeCheckerOutput(errorMessage(error), replacements));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const mode = process.argv[2];
  if ((mode !== "quint" && mode !== "lean") || process.argv.length !== 3) {
    console.error("usage: bun run ./scripts/verification-tools.ts quint|lean");
    process.exit(2);
  }
  try {
    await runVerification(mode);
    console.log(`verify:${mode} passed`);
  } catch (error) {
    console.error(`verify:${mode} failed: ${errorMessage(error)}`);
    process.exit(1);
  }
}
