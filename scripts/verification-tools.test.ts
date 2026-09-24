/**
 * Tests for the pinned formal-verification checkers in
 * `scripts/verification-tools.ts`: exact pins and the CI job that uses them,
 * download admission, bounded checker processes, checker verdicts, the Quint
 * and Lean manifests, the Lean trust-base scan, sanitized logs, and the
 * boundary that keeps verification out of the published package.
 *
 * The Quint and Apalache fixtures are real checker output from the smoke
 * model, with the long middle sections shortened and local paths replaced by
 * the same placeholders the checker logs use.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";

import { assertAsyncProperty, assertProperty, fc } from "../src/test-support.js";
import {
  APALACHE,
  ELAN,
  FORBIDDEN_AXIOMS,
  JDK,
  KERNEL_AXIOMS,
  LEAN,
  LEAN_CANARY_MODULE,
  LEAN_DIFFERENTIAL_RUNNER,
  LEAN_DIFFERENTIAL_TEST,
  LEAN_DIFFERENTIAL_TESTS,
  PLATFORM_KEYS,
  QUINT,
  QUINT_REPLAY_SCRIPT,
  QUINT_REPLAY_TIMEOUT_MS,
  QUINT_TRACE_TIMEOUT_MS,
  REPOSITORY_ROOT,
  RUST_ORACLE,
  VERIFICATION_ARTIFACTS,
  admitArchive,
  apalacheVerdict,
  axiomAuditArguments,
  axiomAuditFindings,
  jdkIdentityLines,
  jdkIdentityMatches,
  leanCanarySource,
  leanCodeWithoutComments,
  leanProjectFindings,
  leanSourceFindings,
  leanStaticFindings,
  leanTypeDigest,
  parseAxiomAudit,
  parseLeanProofs,
  parseQuintModels,
  pathReplacements,
  pinnedArchives,
  pinnedArchivesDigest,
  platformKey,
  quintReplayCommand,
  quintReplayTests,
  quintRunArguments,
  quintSeedLine,
  quintSimulationVerdict,
  quintTraceArguments,
  quintTypecheckVerdict,
  readQuintModels,
  requireFinished,
  requireVerdict,
  runTool,
  sanitizeCheckerOutput,
  verificationCacheDirectory,
  type AuditedDeclaration,
  type AuditedMutant,
  type AxiomAudit,
  type CheckerResult,
  type FetchLike,
  type PinnedArchive,
  type ToolOutcome,
} from "./verification-tools.js";
import {
  invalidatingMutation,
  isJsonObject,
  jsonAt,
  jsonWith,
  rejects,
  type JsonPath,
  type JsonValue,
} from "./verification-test-support.js";

const repositoryFile = (path: string): Promise<string> => readFile(join(REPOSITORY_ROOT, path), "utf8");
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function withDirectory<T>(prefix: string, body: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

describe("checker pins", () => {
  test("pins every checker to an exact version", () => {
    expect(QUINT.version).toBe("0.32.0");
    expect(APALACHE.version).toBe("0.62.2");
    expect(APALACHE.build).toBe("f0dec98");
    expect(JDK.runtimeVersion).toBe("21.0.12.1+1-LTS");
    expect(JDK.vendor).toBe("Eclipse Adoptium");
    expect(JDK.vendorVersion).toBe("Temurin-21.0.12.1+1");
    expect(ELAN.version).toBe("4.2.4");
    expect(LEAN.version).toBe("4.34.0");
    expect(LEAN.toolchain).toBe("leanprover/lean4:v4.34.0");
    expect(LEAN.toolchainDirectory).toBe("leanprover--lean4---v4.34.0");
  });

  test("installs exactly the pinned Quint package from the frozen lockfile", async () => {
    const manifest = JSON.parse(await repositoryFile("package.json")) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(manifest.devDependencies?.[QUINT.packageName]).toBe(QUINT.version);
    expect(manifest.dependencies?.[QUINT.packageName]).toBeUndefined();
    const lock = await repositoryFile("bun.lock");
    const entries = lock.split("\n").filter((line) => line.trimStart().startsWith(`"${QUINT.packageName}": [`));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^ {4}"@informalsystems\/quint": \["@informalsystems\/quint@0\.32\.0", "", \{.*\}, "sha512-[A-Za-z0-9+/]+={0,2}"\],$/u);
    const installed = JSON.parse(await repositoryFile(`node_modules/${QUINT.packageName}/package.json`)) as { version?: unknown };
    expect(installed.version).toBe(QUINT.version);
    expect(QUINT.cli).toBe(`node_modules/${QUINT.packageName}/dist/src/cli.js`);
  });

  test("pins every checker archive as an exact GitHub release asset with a size and SHA-256", () => {
    const archives = pinnedArchives();
    expect(archives).toHaveLength(1 + 3 * PLATFORM_KEYS.length);
    expect(new Set(archives.map((archive) => archive.name)).size).toBe(archives.length);
    expect(new Set(archives.map((archive) => archive.sha256)).size).toBe(archives.length);
    for (const archive of archives) {
      expect(Object.isFrozen(archive)).toBeTrue();
      expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(Number.isSafeInteger(archive.bytes) && archive.bytes > 0).toBeTrue();
      expect(archive.url.endsWith(`/${archive.name}`)).toBeTrue();
      expect(archive.url).toMatch(/^https:\/\/github\.com\/[a-z0-9-]+\/[a-z0-9-]+\/releases\/download\/[A-Za-z0-9.%-]+\/[A-Za-z0-9._+-]+$/u);
      expect(archive.name).toMatch(archive.format === "tar.gz" ? /\.(?:tar\.gz|tgz)$/u : /\.tar\.zst$/u);
    }
    expect(APALACHE.archive.url).toBe(
      "https://github.com/apalache-mc/apalache/releases/download/v0.62.2/apalache-0.62.2.tgz",
    );
    expect(APALACHE.archive.entry).toBe("apalache-0.62.2");
    const names: Readonly<Record<(typeof PLATFORM_KEYS)[number], readonly [string, string, string]>> = {
      "linux-x64": [
        "OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz",
        "elan-x86_64-unknown-linux-gnu.tar.gz",
        "lean-4.34.0-linux.tar.zst",
      ],
      "linux-arm64": [
        "OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.12.1_1.tar.gz",
        "elan-aarch64-unknown-linux-gnu.tar.gz",
        "lean-4.34.0-linux_aarch64.tar.zst",
      ],
      "darwin-x64": [
        "OpenJDK21U-jdk_x64_mac_hotspot_21.0.12.1_1.tar.gz",
        "elan-x86_64-apple-darwin.tar.gz",
        "lean-4.34.0-darwin.tar.zst",
      ],
      "darwin-arm64": [
        "OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.12.1_1.tar.gz",
        "elan-aarch64-apple-darwin.tar.gz",
        "lean-4.34.0-darwin_aarch64.tar.zst",
      ],
    };
    for (const key of PLATFORM_KEYS) {
      const [jdk, elan, lean] = names[key];
      expect(JDK.archives[key].name).toBe(jdk);
      expect(JDK.archives[key].url).toBe(`https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/${jdk}`);
      expect(JDK.archives[key].entry).toBe("jdk-21.0.12.1+1");
      expect(ELAN.archives[key].name).toBe(elan);
      expect(ELAN.archives[key].url).toBe(`https://github.com/leanprover/elan/releases/download/v4.2.4/${elan}`);
      expect(ELAN.archives[key].entry).toBe("elan-init");
      expect(LEAN.archives[key].name).toBe(lean);
      expect(LEAN.archives[key].url).toBe(`https://github.com/leanprover/lean4/releases/download/v4.34.0/${lean}`);
      expect(LEAN.archives[key].entry).toBe(lean.replace(/\.tar\.zst$/u, ""));
    }
  });

  test("pins the Lean project to the same toolchain", async () => {
    expect(await repositoryFile("verification/lean/lean-toolchain")).toBe(`${LEAN.toolchain}\n`);
  });

  test("maps only the four supported platforms to pinned archives", () => {
    expect(platformKey("linux", "x64")).toBe("linux-x64");
    expect(platformKey("linux", "arm64")).toBe("linux-arm64");
    expect(platformKey("darwin", "x64")).toBe("darwin-x64");
    expect(platformKey("darwin", "arm64")).toBe("darwin-arm64");
    for (const [platform, arch] of [["win32", "x64"], ["linux", "ia32"], ["freebsd", "x64"], ["darwin", "arm"]] as const) {
      expect(() => platformKey(platform, arch)).toThrow(
        `The formal-verification toolchain has no pinned archives for ${platform}-${arch}`,
      );
    }
  });

  test("keeps the download cache outside the repository unless an absolute path is configured", () => {
    expect(verificationCacheDirectory({}, "/home/runner")).toBe("/home/runner/.cache/ghostget-verification");
    expect(verificationCacheDirectory({ GHOSTGET_VERIFICATION_CACHE: "" }, "/home/runner"))
      .toBe("/home/runner/.cache/ghostget-verification");
    expect(verificationCacheDirectory({ GHOSTGET_VERIFICATION_CACHE: "/var/cache/checkers" }, "/home/runner"))
      .toBe("/var/cache/checkers");
    for (const configured of ["relative/cache", "./cache", "~/cache"]) {
      expect(() => verificationCacheDirectory({ GHOSTGET_VERIFICATION_CACHE: configured }, "/home/runner"))
        .toThrow("GHOSTGET_VERIFICATION_CACHE must be an absolute path");
    }
    expect(relative(REPOSITORY_ROOT, verificationCacheDirectory({}, homedir())).startsWith("..")).toBeTrue();
  });
});

describe("verification CI job", () => {
  type Step = {
    name?: string;
    uses?: string;
    run?: string;
    if?: string;
    "timeout-minutes"?: number;
    "working-directory"?: string;
    with?: Record<string, unknown>;
    env?: Record<string, string>;
  };
  type Job = { name?: string; "timeout-minutes"?: number; permissions?: unknown; needs?: string[]; steps: Step[] };
  type Workflow = { permissions?: unknown; jobs: Record<string, Job> };
  const workflowSource = (): Promise<string> => repositoryFile(".github/workflows/ci.yml");

  test("caches only pinned downloads under a key derived from the pins", async () => {
    const source = await workflowSource();
    const workflow = Bun.YAML.parse(source) as Workflow;
    const job = workflow.jobs.verification;
    if (job === undefined) throw new Error("ci.yml has no verification job");
    const cache = job.steps.filter((step) => step.uses?.startsWith("actions/cache@") === true);
    expect(cache).toHaveLength(1);
    const pins = pinnedArchives().map(({ name, url, bytes, sha256 }) => ({ name, url, bytes, sha256 }));
    const digest = createHash("sha256").update(JSON.stringify(pins)).digest("hex").slice(0, 16);
    expect(pinnedArchivesDigest()).toBe(digest);
    expect(cache[0]!.with).toEqual({
      path: `${verificationCacheDirectory({}, "~")}/downloads`,
      key: `ghostget-verification-\${{ runner.os }}-\${{ runner.arch }}-pins-${digest}`,
    });
    // Any single pin change, including a digest or size change at the same version, changes the key.
    const archive = pinnedArchives()[0]!;
    for (const changed of [{ ...archive, sha256: "0".repeat(64) }, { ...archive, bytes: archive.bytes + 1 }]) {
      const repinned = [changed, ...pinnedArchives().slice(1)].map(({ name, url, bytes, sha256 }) => ({ name, url, bytes, sha256 }));
      expect(createHash("sha256").update(JSON.stringify(repinned)).digest("hex").slice(0, 16)).not.toBe(digest);
    }
    const verify = job.steps.findIndex((step) => step.run === "bun run verify");
    const install = job.steps.findIndex((step) => step.run === "bun install --frozen-lockfile --ignore-scripts");
    expect(install).toBeGreaterThanOrEqual(0);
    expect(job.steps.indexOf(cache[0]!)).toBe(install + 1);
    // The only step between the cache and verify installs the oracle's exact
    // Rust toolchain with the runner's rustup and checks both versions.
    const rust = job.steps[install + 2]!;
    expect(rust.name).toBe("Install the pinned Rust toolchain");
    expect(rust["working-directory"]).toBe(RUST_ORACLE.directory);
    expect(rust.uses).toBeUndefined();
    expect(rust.run).toContain(`rustup toolchain install ${RUST_ORACLE.toolchain} --profile minimal --no-self-update`);
    expect(rust.run).toContain(`test "$(rustc --version | cut -d ' ' -f 2)" = "${RUST_ORACLE.toolchain}"`);
    expect(rust.run).toContain(`test "$(cargo --version | cut -d ' ' -f 2)" = "${RUST_ORACLE.toolchain}"`);
    expect(verify).toBe(install + 3);
    expect(source).not.toContain("setup-java");
  });

  test("runs bun run verify once, bounded, without credentials, and retains its sanitized logs", async () => {
    const source = await workflowSource();
    const workflow = Bun.YAML.parse(source) as Workflow;
    const job = workflow.jobs.verification;
    if (job === undefined) throw new Error("ci.yml has no verification job");
    expect(job.name).toBe("verification");
    expect(job["timeout-minutes"]).toBe(35);
    expect(job.permissions).toBeUndefined();
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job.steps.filter((step) => step.uses?.startsWith("actions/checkout@") === true).map((step) => step.with))
      .toEqual([{ "persist-credentials": false }]);
    expect(source.match(/^ {6}- run: bun run verify$/gmu)).toHaveLength(1);
    expect(job.steps.filter((step) => step.run === "bun run verify")).toHaveLength(1);
    const upload = job.steps.filter((step) => step.uses?.startsWith("actions/upload-artifact@") === true);
    expect(upload).toHaveLength(1);
    expect(upload[0]!.with).toEqual({
      name: "verification-attempt-${{ github.run_attempt }}",
      path: `${VERIFICATION_ARTIFACTS}/`,
      "if-no-files-found": "error",
      "retention-days": 30,
    });
    expect(job.steps.indexOf(upload[0]!)).toBe(job.steps.length - 1);
    // A failed or timed-out verify step still uploads its logs: the step bound ends it inside the job bound.
    expect(upload[0]!.if).toBe("always()");
    const verifyStep = job.steps.find((step) => step.run === "bun run verify")!;
    expect(verifyStep["timeout-minutes"]).toBe(30);
    expect(verifyStep["timeout-minutes"]!).toBeLessThan(job["timeout-minutes"]! - 2);
    expect(JSON.stringify(job)).not.toContain("secrets.");
    for (const match of source.matchAll(/^\s*(?:- )?uses: (\S+)/gmu)) {
      expect(match[1]).toMatch(/^[A-Za-z0-9-]+\/[A-Za-z0-9-]+@[0-9a-f]{40}$/u);
    }
  });

  test("makes a failed, cancelled, or skipped verification job fail Required", async () => {
    const workflow = Bun.YAML.parse(await workflowSource()) as Workflow;
    const required = workflow.jobs.required;
    if (required === undefined) throw new Error("ci.yml has no Required job");
    expect(required.needs).toContain("verification");
    const gate = required.steps.find((step) => step.name === "Require every selected job");
    expect(gate?.env?.VERIFICATION).toBe("${{ needs.verification.result }}");
    expect(gate?.run).toMatch(/^for result in .*"\$VERIFICATION"; do$/mu);
    expect(gate?.run).toContain('if [[ "$result" != success ]]; then');
  });
});

// ---------------------------------------------------------------------------
// Download admission
// ---------------------------------------------------------------------------

const PAYLOAD = new TextEncoder().encode("a pinned checker archive\n");
const ARCHIVE: PinnedArchive = Object.freeze({
  name: "checker-1.0.0.tar.gz",
  url: "https://github.com/example/checker/releases/download/v1.0.0/checker-1.0.0.tar.gz",
  bytes: PAYLOAD.byteLength,
  sha256: sha256(PAYLOAD),
  format: "tar.gz",
  entry: "checker-1.0.0",
});

type Served = Readonly<{
  status?: number;
  chunks?: readonly Uint8Array[];
  declared?: string;
  /** Fail the stream after the chunks instead of closing it. */
  reset?: boolean;
  /** Serve a response without a body. */
  empty?: boolean;
}>;

function server(served: Served, calls: string[]): FetchLike {
  return (url, init) => {
    calls.push(url);
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const chunks = [...(served.chunks ?? [])];
    const body = served.empty === true ? null : new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk !== undefined) controller.enqueue(chunk);
        else if (served.reset === true) controller.error(new Error("connection reset"));
        else controller.close();
      },
    });
    const headers = served.declared === undefined ? {} : { "content-length": served.declared };
    return Promise.resolve(new Response(body, { status: served.status ?? 200, headers }));
  };
}

const refuseFetch: FetchLike = () => Promise.reject(new Error("the cache must be used without a download"));

function chunked(bytes: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const points = [...new Set(cuts.map((cut) => Math.min(cut, bytes.byteLength)))].sort((left, right) => left - right);
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const point of [...points, bytes.byteLength]) {
    if (point > start) chunks.push(bytes.slice(start, point));
    start = Math.max(start, point);
  }
  return chunks;
}

describe("pinned archive admission", () => {
  test("downloads an archive once, admits it at its pin, and reuses the verified cache", async () => {
    await withDirectory("ghostget-admission-", async (cache) => {
      const calls: string[] = [];
      const logs: string[] = [];
      const path = await admitArchive(ARCHIVE, {
        cacheDirectory: cache,
        fetch: server({ chunks: [PAYLOAD.slice(0, 7), PAYLOAD.slice(7)], declared: String(PAYLOAD.byteLength) }, calls),
        log: (line) => logs.push(line),
      });
      const downloads = join(cache, "downloads");
      expect(path).toBe(join(downloads, ARCHIVE.name));
      expect(new Uint8Array(await readFile(path))).toEqual(PAYLOAD);
      expect(calls).toEqual([ARCHIVE.url]);
      expect(logs).toEqual([
        `Downloading ${ARCHIVE.name} (${String(PAYLOAD.byteLength)} bytes)`,
        `Admitted ${ARCHIVE.name} at SHA-256 ${ARCHIVE.sha256}`,
      ]);
      expect(await readdir(downloads)).toEqual([ARCHIVE.name]);
      expect((await stat(downloads)).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o077).toBe(0);
      expect(await admitArchive(ARCHIVE, { cacheDirectory: cache, fetch: refuseFetch })).toBe(path);
    });
  });

  test("re-downloads a cached file, directory, or symbolic link that is not the pinned archive", async () => {
    await withDirectory("ghostget-admission-", async (cache) => {
      const downloads = join(cache, "downloads");
      const target = join(downloads, ARCHIVE.name);
      const outside = join(cache, "outside.tar.gz");
      await writeFile(outside, PAYLOAD);
      const replacements: readonly (() => Promise<void>)[] = [
        () => writeFile(target, "a stale archive\n"),
        () => writeFile(target, PAYLOAD.slice(0, -1)),
        async () => {
          await mkdir(target);
          await writeFile(join(target, "inner"), PAYLOAD);
        },
        () => symlink(outside, target),
      ];
      for (const [index, replace] of replacements.entries()) {
        await rm(downloads, { recursive: true, force: true });
        await mkdir(downloads, { recursive: true });
        await replace();
        const calls: string[] = [];
        const logs: string[] = [];
        expect(await admitArchive(ARCHIVE, {
          cacheDirectory: cache,
          fetch: server({ chunks: [PAYLOAD] }, calls),
          log: (line) => logs.push(line),
        })).toBe(target);
        expect(calls).toEqual([ARCHIVE.url]);
        // A stale regular file is reported; a directory or link is never hashed.
        expect(logs.includes(`${ARCHIVE.name}: the cached archive does not match its pin; downloading it again`))
          .toBe(index < 2);
        expect((await lstat(target)).isFile()).toBeTrue();
        expect(new Uint8Array(await readFile(target))).toEqual(PAYLOAD);
        expect(await readdir(downloads)).toEqual([ARCHIVE.name]);
      }
      expect(new Uint8Array(await readFile(outside))).toEqual(PAYLOAD);
    });
  });

  test("rejects every download that does not match its pin and leaves nothing behind", async () => {
    const flipped = PAYLOAD.slice();
    flipped[3] = flipped[3]! ^ 0x01;
    const cases: readonly (readonly [Served | "network", string | RegExp])[] = [
      [{ chunks: [flipped] }, new RegExp(
        `^checker-1\\.0\\.0\\.tar\\.gz: the download is ${String(PAYLOAD.byteLength)} bytes with SHA-256 ${sha256(flipped)}, not the pinned ${String(PAYLOAD.byteLength)} bytes and ${ARCHIVE.sha256}$`,
        "u",
      )],
      [{ chunks: [PAYLOAD.slice(0, -1)] }, `the download is ${String(PAYLOAD.byteLength - 1)} bytes with SHA-256`],
      [{ chunks: [PAYLOAD, new Uint8Array([0x0a])] }, `checker-1.0.0.tar.gz: the download exceeds its pinned ${String(PAYLOAD.byteLength)} bytes`],
      [{ chunks: [PAYLOAD], declared: String(PAYLOAD.byteLength + 1) }, `checker-1.0.0.tar.gz: the server declared ${String(PAYLOAD.byteLength + 1)} bytes, not the pinned ${String(PAYLOAD.byteLength)}`],
      [{ status: 404, chunks: [PAYLOAD] }, "checker-1.0.0.tar.gz: the download failed with HTTP 404"],
      [{ status: 500, chunks: [] }, "checker-1.0.0.tar.gz: the download failed with HTTP 500"],
      [{ empty: true }, "checker-1.0.0.tar.gz: the download failed with HTTP 200"],
      [{ chunks: [PAYLOAD.slice(0, 5)], reset: true }, "connection reset"],
      ["network", "network unreachable"],
    ];
    await withDirectory("ghostget-admission-", async (cache) => {
      for (const [served, message] of cases) {
        const calls: string[] = [];
        const fetch: FetchLike = served === "network"
          ? (url) => {
            calls.push(url);
            return Promise.reject(new Error("network unreachable"));
          }
          : server(served, calls);
        const admission = admitArchive(ARCHIVE, { cacheDirectory: cache, fetch });
        if (typeof message === "string") await expect(admission).rejects.toThrow(message);
        else await expect(admission).rejects.toThrow(message);
        expect(calls).toEqual([ARCHIVE.url]);
        expect(await readdir(join(cache, "downloads"))).toEqual([]);
      }
    });
  });

  test("requires an absolute cache directory before any download", async () => {
    const calls: string[] = [];
    await expect(admitArchive(ARCHIVE, { cacheDirectory: "relative/cache", fetch: server({ chunks: [PAYLOAD] }, calls) }))
      .rejects.toThrow("The verification cache must be an absolute path");
    expect(calls).toEqual([]);
  });

  test("admits a served archive exactly when its bytes equal the pinned bytes", async () => {
    const served = fc.oneof(
      fc.constant(PAYLOAD),
      fc.uint8Array({ maxLength: 64 }),
      fc.tuple(fc.nat({ max: PAYLOAD.byteLength - 1 }), fc.integer({ min: 1, max: 255 }))
        .map(([index, mask]) => {
          const bytes = PAYLOAD.slice();
          bytes[index] = bytes[index]! ^ mask;
          return bytes;
        }),
      fc.nat({ max: PAYLOAD.byteLength }).map((length) => PAYLOAD.slice(0, length)),
      fc.uint8Array({ minLength: 1, maxLength: 8 }).map((extra) => new Uint8Array([...PAYLOAD, ...extra])),
    );
    await assertAsyncProperty(fc.asyncProperty(
      served,
      fc.array(fc.nat({ max: 80 }), { maxLength: 6 }),
      fc.boolean(),
      async (bytes, cuts, declare) => withDirectory("ghostget-admission-", async (cache) => {
        const calls: string[] = [];
        const fetch = server({
          chunks: chunked(bytes, cuts),
          ...(declare ? { declared: String(bytes.byteLength) } : {}),
        }, calls);
        const pinnedBytes = bytes.byteLength === PAYLOAD.byteLength && bytes.every((byte, index) => byte === PAYLOAD[index]);
        let admitted: string | null = null;
        try {
          admitted = await admitArchive(ARCHIVE, { cacheDirectory: cache, fetch });
        } catch {
          admitted = null;
        }
        expect(admitted !== null).toBe(pinnedBytes);
        expect(calls).toHaveLength(1);
        const listing = await readdir(join(cache, "downloads"));
        if (admitted === null) {
          expect(listing).toEqual([]);
        } else {
          expect(listing).toEqual([ARCHIVE.name]);
          expect(new Uint8Array(await readFile(admitted))).toEqual(PAYLOAD);
        }
      }),
    ), { numRuns: 100 });
  });
});

// ---------------------------------------------------------------------------
// Bounded checker processes
// ---------------------------------------------------------------------------

const PROCESS_ENVIRONMENT = Object.freeze({ PATH: "/usr/bin:/bin" });

/** Poll until `pid` no longer names a live process. */
async function processGone(pid: number): Promise<boolean> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === "ESRCH" || code === "EPERM") return true;
      throw error;
    }
    await Bun.sleep(20);
  }
  return false;
}

function printedPid(outcome: ToolOutcome): number {
  const pid = Number(outcome.stdout.trim());
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error(`the probe did not print its process ID: ${outcome.stdout}`);
  return pid;
}

function expectUnfinished(outcome: ToolOutcome, kind: Exclude<ToolOutcome["kind"], "exited">, detail: string | RegExp): void {
  expect(outcome.kind).toBe(kind);
  if (outcome.kind === "exited") throw new Error("the probe exited");
  if (typeof detail === "string") expect(outcome.detail).toBe(detail);
  else expect(outcome.detail).toMatch(detail);
  expect(() => requireFinished("probe", outcome)).toThrow(
    `probe did not finish (${outcome.detail}); a timeout or an interrupted checker run is not evidence`,
  );
}

describe("bounded checker processes", () => {
  test("reports an exited process with its exact exit code and output", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const outcome = await runTool(["/bin/sh", "-c", "printf out; printf err >&2; exit 3"], {
        cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 30_000, killGraceMs: 200,
      });
      expect(outcome).toEqual({ kind: "exited", exitCode: 3, stdout: "out", stderr: "err" });
      if (outcome.kind !== "exited") throw new Error("the probe did not exit");
      expect(requireFinished("probe", outcome)).toBe(outcome);
    });
  });

  test("runs with exactly the given environment and working directory", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const environment = { PATH: "/usr/bin:/bin", GHOSTGET_PROBE: "a value with spaces" };
      const printed = await runTool(["/usr/bin/env"], { cwd, environment, timeoutMs: 30_000, killGraceMs: 200 });
      expect(printed.kind).toBe("exited");
      expect(printed.stdout.split("\n").filter((line) => line !== "").sort())
        .toEqual(["GHOSTGET_PROBE=a value with spaces", "PATH=/usr/bin:/bin"]);
      const directory = await runTool(["/bin/sh", "-c", "pwd -P"], {
        cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 30_000, killGraceMs: 200,
      });
      expect(directory).toEqual({ kind: "exited", exitCode: 0, stdout: `${await realpath(cwd)}\n`, stderr: "" });
    });
  });

  test("stops the whole process group at the deadline and reports a timeout, not a verdict", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const outcome = await runTool(["/bin/sh", "-c", "sleep 30 & echo $!; wait"], {
        cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 300, killGraceMs: 200,
      });
      expectUnfinished(outcome, "timed-out", "no result within 300 ms");
      expect(await processGone(printedPid(outcome))).toBeTrue();
    });
  });

  test("kills a process group that ignores SIGTERM after the grace period", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const outcome = await runTool(["/bin/sh", "-c", "trap '' TERM; sleep 30 & echo $!; wait"], {
        cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 300, killGraceMs: 200,
      });
      expectUnfinished(outcome, "timed-out", "no result within 300 ms");
      expect(await processGone(printedPid(outcome))).toBeTrue();
    });
  });

  test("abandons the output of a process that escaped the group instead of waiting for it", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const started = performance.now();
      const outcome = await runTool([
        "/usr/bin/perl",
        "-e",
        "$| = 1; if (fork() == 0) { setpgrp(0, 0); print \"$$\\n\"; sleep 30; exit 0 } sleep 30",
      ], { cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 1_000, killGraceMs: 200 });
      const escaped = printedPid(outcome);
      try {
        expect(performance.now() - started).toBeLessThan(10_000);
        expectUnfinished(outcome, "timed-out", "no result within 1000 ms");
      } finally {
        try {
          process.kill(escaped, "SIGKILL");
        } catch {
          // The escaped process has already exited.
        }
      }
      expect(await processGone(escaped)).toBeTrue();
    });
  });

  test("stops a process at its output bound", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const outcome = await runTool(["/usr/bin/yes"], {
        cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 30_000, maxOutputBytes: 1_024, killGraceMs: 200,
      });
      expectUnfinished(outcome, "output-limit", "output exceeded 1024 bytes");
      expect(Buffer.byteLength(outcome.stdout)).toBeLessThanOrEqual(1_024);
      expect(outcome.stdout).toMatch(/^(?:y\n)*y?$/u);
    });
  });

  test("reports a signal and a failed start as unfinished runs", async () => {
    await withDirectory("ghostget-tool-", async (cwd) => {
      const options = { cwd, environment: PROCESS_ENVIRONMENT, timeoutMs: 30_000, killGraceMs: 200 };
      expectUnfinished(await runTool(["/bin/sh", "-c", "kill -KILL $$"], options), "signaled", "terminated by SIGKILL");
      expectUnfinished(await runTool([join(cwd, "missing-checker")], options), "spawn-failed", /\S/u);
      expectUnfinished(
        await runTool(["/bin/sh", "-c", "exit 0"], { ...options, cwd: join(cwd, "missing-directory") }),
        "spawn-failed",
        /\S/u,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Checker verdicts
// ---------------------------------------------------------------------------

const QUINT_SEED = "20260923";

const QUINT_PASS = [
  "An example execution:",
  "",
  "[State 0] { critical: Set(), holder: \"\" }",
  "",
  "[State 1] { critical: Set(\"a\"), holder: \"a\" }",
  "",
  "[State 2] { critical: Set(), holder: \"\" }",
  "",
  "[ok] No violation found (363ms at 5510 traces/second).",
  "Trace length statistics: max=13, min=13, average=13.00",
  "You may increase --max-samples and --max-steps.",
  "Use --verbosity to produce more (or less) output.",
  "Use --seed=0x135283b --backend=typescript to reproduce.",
  "",
].join("\n");

const QUINT_VIOLATION = [
  "An example execution:",
  "",
  "[State 0] { critical: Set(), holder: \"\" }",
  "",
  "[State 1] { critical: Set(\"a\"), holder: \"a\" }",
  "",
  "[State 2] { critical: Set(\"a\", \"b\"), holder: \"b\" }",
  "",
  "[violation] Found an issue (19ms at 53 traces/second).",
  "Use --verbosity=3 to show executions.",
  "Use --seed=0x135283b --backend=typescript to reproduce.",
  "",
].join("\n");

/** Apalache pads each log message to column 66 and appends its timestamp. */
const logged = (message: string, time: string): string =>
  `${message.length >= 66 ? `${message} ` : message.padEnd(66)}I@${time}`;

const APALACHE_HEADER = [
  "# Usage statistics is OFF. We care about your privacy.",
  "# If you want to help our project, consider enabling statistics with config --enable-stats=true.",
  "",
];

const APALACHE_PASS = [
  ...APALACHE_HEADER,
  "Output directory: <work>/apalache-out-nAvpHB/lock.qnt.json/2026-09-23T23-27-42_5350862204321491089",
  logged("# APALACHE version: 0.62.2 | build: f0dec98", "23:27:42.994"),
  logged("PASS #0: SanyParser", "23:27:43.294"),
  logged("  > Set the transition predicate to step", "23:27:43.899"),
  logged("PASS #13: BoundedChecker", "23:27:44.044"),
  logged("State 10: Checking 1 state invariants", "23:27:47.476"),
  logged("State 10: state invariant 0 holds.", "23:27:47.492"),
  logged("Step 10: picking a transition out of 1 transition(s)", "23:27:47.493"),
  logged("The outcome is: NoError", "23:27:47.509"),
  logged("Checker reports no error up to computation length 10", "23:27:47.519"),
  logged("It took me 0 days  0 hours  0 min  4 sec", "23:27:47.524"),
  logged("Total time: 4.526 sec", "23:27:47.524"),
  "EXITCODE: OK",
  "",
].join("\n");

const APALACHE_VIOLATION = [
  ...APALACHE_HEADER,
  "Output directory: <work>/apalache-out-JSZXRQ/lock.qnt.json/2026-09-23T23-27-48_3942792904328759442",
  logged("# APALACHE version: 0.62.2 | build: f0dec98", "23:27:48.123"),
  logged("PASS #0: SanyParser", "23:27:48.370"),
  logged("  > Set the transition predicate to stepMutant", "23:27:48.946"),
  logged("PASS #13: BoundedChecker", "23:27:49.067"),
  logged("State 2: Checking 1 state invariants", "23:27:50.153"),
  logged("Check the trace in: <work>/apalache-out-JSZXRQ/lock.qnt.json/2026-09-23T23-27-48_3942792904328759442/violation1.itf.json", "23:27:50.290"),
  logged("State 2: state invariant 0 violated.", "23:27:50.291"),
  logged("Found 1 error(s)", "23:27:50.292"),
  logged("The outcome is: Error", "23:27:50.295"),
  logged("Checker has found an error", "23:27:50.302"),
  logged("It took me 0 days  0 hours  0 min  2 sec", "23:27:50.302"),
  logged("Total time: 2.173 sec", "23:27:50.302"),
  "EXITCODE: ERROR (12)",
  "",
].join("\n");

const quintPass: CheckerResult = Object.freeze({ exitCode: 0, stdout: QUINT_PASS, stderr: "" });
const quintViolation: CheckerResult = Object.freeze({ exitCode: 1, stdout: QUINT_VIOLATION, stderr: "error: Invariant violated\n" });
const apalachePass: CheckerResult = Object.freeze({ exitCode: 0, stdout: APALACHE_PASS, stderr: "" });
const apalacheViolation: CheckerResult = Object.freeze({ exitCode: 12, stdout: APALACHE_VIOLATION, stderr: "" });

const lineSoup = (lines: readonly string[]): fc.Arbitrary<string> =>
  fc.array(fc.oneof(fc.constantFrom(...lines), fc.string({ maxLength: 30 })), { maxLength: 30 })
    .map((parts) => parts.join("\n"));

describe("checker verdicts", () => {
  test("prints Quint's reproduction line for the decimal seed", () => {
    expect(quintSeedLine(QUINT_SEED)).toBe("Use --seed=0x135283b --backend=typescript to reproduce.");
    assertProperty(fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (seed) => {
      const match = /^Use --seed=0x([0-9a-f]+) --backend=typescript to reproduce\.$/u.exec(quintSeedLine(String(seed)));
      return match !== null && BigInt(`0x${match[1]!}`) === BigInt(seed);
    }));
  });

  test("accepts a Quint typecheck only when it is silent and exits 0", () => {
    expect(quintTypecheckVerdict({ exitCode: 0, stdout: "", stderr: "" })).toBe("pass");
    expect(quintTypecheckVerdict({ exitCode: 0, stdout: "\n", stderr: " \n" })).toBe("pass");
    expect(quintTypecheckVerdict({ exitCode: 1, stdout: "", stderr: "" })).toBe("inconclusive");
    expect(quintTypecheckVerdict({ exitCode: 0, stdout: "", stderr: "lock.qnt:3:5 - error: [QNT404] Name 'x' not found" }))
      .toBe("inconclusive");
    expect(quintTypecheckVerdict({ exitCode: 0, stdout: "warning", stderr: "" })).toBe("inconclusive");
  });

  test("classifies real Quint simulation output and nothing else", () => {
    expect(quintSimulationVerdict(quintPass)).toBe("pass");
    expect(quintSimulationVerdict(quintViolation)).toBe("violation");
    expect(quintSimulationVerdict({ ...quintPass, stdout: QUINT_PASS.replaceAll("\n", "\r\n") })).toBe("pass");
    const inconclusive: readonly CheckerResult[] = [
      { ...quintPass, stdout: QUINT_PASS.replace(quintSeedLine(QUINT_SEED), "") },
      { ...quintPass, stdout: QUINT_PASS.replace("[ok] No violation found", "  [ok] No violation found") },
      { ...quintPass, stdout: `${QUINT_PASS}[violation] Found an issue (1ms).\n` },
      { ...quintPass, stdout: QUINT_PASS.replace("[ok] No violation found", "[ok] Nothing found") },
      { ...quintPass, exitCode: 1 },
      { ...quintPass, exitCode: -1 },
      { ...quintPass, stderr: "warning: the --seed flag is deprecated\n" },
      { ...quintViolation, exitCode: 0 },
      { ...quintViolation, exitCode: 2 },
      { ...quintViolation, stderr: "" },
      { ...quintViolation, stderr: "error: Runtime error\n" },
      { ...quintViolation, stdout: QUINT_VIOLATION.replace(quintSeedLine(QUINT_SEED), "") },
      { exitCode: 0, stdout: "", stderr: "" },
    ];
    for (const result of inconclusive) expect(quintSimulationVerdict(result)).toBe("inconclusive");
    // Quint reports the seed of the trace it shows, which need not be the first sample's.
    const later = quintSeedLine("20265114");
    expect(quintSimulationVerdict({ ...quintPass, stdout: QUINT_PASS.replace(quintSeedLine(QUINT_SEED), later) })).toBe("pass");
    expect(quintSimulationVerdict({ ...quintViolation, stdout: QUINT_VIOLATION.replace(quintSeedLine(QUINT_SEED), later) }))
      .toBe("violation");
    expect(quintSimulationVerdict({ ...quintPass, stdout: `${QUINT_PASS}${later}\n` })).toBe("inconclusive");
    expect(quintSimulationVerdict({ ...quintPass, stdout: QUINT_PASS.replace("--seed=0x", "--seed=") })).toBe("inconclusive");
    expect(quintSimulationVerdict({ ...quintPass, stdout: QUINT_PASS.replace("--backend=typescript", "--backend=rust") }))
      .toBe("inconclusive");
  });

  test("classifies real Apalache output and nothing else", () => {
    expect(apalacheVerdict(apalachePass, 10)).toBe("pass");
    expect(apalacheVerdict(apalacheViolation, 10)).toBe("violation");
    const version = logged("# APALACHE version: 0.62.2 | build: f0dec98", "23:27:42.994");
    const inconclusive: readonly (readonly [CheckerResult, number])[] = [
      [apalachePass, 9],
      [apalachePass, 11],
      [{ ...apalachePass, stdout: APALACHE_PASS.replace(version, "") }, 10],
      [{ ...apalachePass, stdout: APALACHE_PASS.replace("version: 0.62.2", "version: 0.62.1") }, 10],
      [{ ...apalachePass, stdout: APALACHE_PASS.replace("build: f0dec98", "build: 0000000") }, 10],
      [{ ...apalachePass, stdout: APALACHE_PASS.replace("EXITCODE: OK", "") }, 10],
      [{ ...apalachePass, stdout: `${APALACHE_PASS}The outcome is: Error\n` }, 10],
      [{ ...apalachePass, stdout: APALACHE_PASS.replace("The outcome is: NoError", "The outcome is: RuntimeError") }, 10],
      [{ ...apalachePass, exitCode: 12 }, 10],
      [{ ...apalachePass, exitCode: 255 }, 10],
      [{ ...apalacheViolation, exitCode: 0 }, 10],
      [{ ...apalacheViolation, exitCode: 255 }, 10],
      [{ ...apalacheViolation, stdout: APALACHE_VIOLATION.replace("Found 1 error(s)", "Found 0 error(s)") }, 10],
      [{ ...apalacheViolation, stdout: APALACHE_VIOLATION.replace("EXITCODE: ERROR (12)", "EXITCODE: ERROR (255)") }, 10],
      [{ exitCode: 0, stdout: "", stderr: "" }, 10],
    ];
    for (const [result, length] of inconclusive) expect(apalacheVerdict(result, length)).toBe("inconclusive");
  });

  test("treats checker output cut off before its last required line as inconclusive", () => {
    const cases: readonly (readonly [CheckerResult, string, (result: CheckerResult) => string])[] = [
      [quintPass, quintSeedLine(QUINT_SEED), (result) => quintSimulationVerdict(result)],
      [quintViolation, quintSeedLine(QUINT_SEED), (result) => quintSimulationVerdict(result)],
      [apalachePass, "EXITCODE: OK", (result) => apalacheVerdict(result, 10)],
      [apalacheViolation, "EXITCODE: ERROR (12)", (result) => apalacheVerdict(result, 10)],
    ];
    for (const [result, lastLine, verdict] of cases) {
      const end = result.stdout.indexOf(lastLine) + lastLine.length;
      expect(end).toBeGreaterThan(lastLine.length);
      expect(verdict({ ...result, stdout: result.stdout.slice(0, end) })).not.toBe("inconclusive");
      for (let cut = 0; cut < end; cut += 1) {
        expect(verdict({ ...result, stdout: result.stdout.slice(0, cut) })).toBe("inconclusive");
      }
    }
  });

  test("never pairs a verdict with a contradicting exit code, error stream, or outcome line", () => {
    const quintLines = [...new Set([...QUINT_PASS.split("\n"), ...QUINT_VIOLATION.split("\n")])];
    assertProperty(fc.property(
      lineSoup(quintLines),
      fc.integer({ min: -1, max: 255 }),
      fc.constantFrom("", "error: Invariant violated\n", "warning: deprecated option\n"),
      (stdout, exitCode, stderr) => {
        const verdict = quintSimulationVerdict({ exitCode, stdout, stderr });
        if (verdict === "pass") {
          return exitCode === 0 && stderr === "" && !/^\[violation\] Found an issue \(/mu.test(stdout);
        }
        if (verdict === "violation") {
          return exitCode === 1 && stderr.includes("error: Invariant violated") && !/^\[ok\] No violation found \(/mu.test(stdout);
        }
        return true;
      },
    ));
    const apalacheLines = [...new Set([...APALACHE_PASS.split("\n"), ...APALACHE_VIOLATION.split("\n")])];
    assertProperty(fc.property(
      lineSoup(apalacheLines),
      fc.integer({ min: -1, max: 255 }),
      (stdout, exitCode) => {
        const verdict = apalacheVerdict({ exitCode, stdout, stderr: "" }, 10);
        const versioned = stdout.includes("# APALACHE version: 0.62.2 | build: f0dec98");
        if (verdict === "pass") {
          return versioned && exitCode === 0 && /^EXITCODE: OK\s*$/mu.test(stdout)
            && !/^The outcome is: Error(?:\s|$)/mu.test(stdout);
        }
        if (verdict === "violation") {
          return versioned && exitCode === 12 && /^EXITCODE: ERROR \(12\)\s*$/mu.test(stdout)
            && !/^The outcome is: NoError(?:\s|$)/mu.test(stdout);
        }
        return true;
      },
    ));
  });

  test("fails a step whose verdict is not the expected one, naming why it is not evidence", () => {
    expect(() => requireVerdict("step", "pass", "pass")).not.toThrow();
    expect(() => requireVerdict("step", "violation", "violation")).not.toThrow();
    expect(() => requireVerdict("quint run lock step mutualExclusion", "pass", "violation")).toThrow(
      "quint run lock step mutualExclusion: expected pass, got violation; the checker found a violation",
    );
    expect(() => requireVerdict("apalache check lock stepMutant mutualExclusion", "violation", "pass")).toThrow(
      "apalache check lock stepMutant mutualExclusion: expected violation, got pass; the checker did not find the seeded defect, so this model is not accepted as evidence",
    );
    for (const expected of ["pass", "violation"] as const) {
      expect(() => requireVerdict("step", expected, "inconclusive")).toThrow(
        `step: expected ${expected}, got inconclusive; the checker output was not a recognized result, which is not evidence`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Quint model manifest
// ---------------------------------------------------------------------------

async function committedModels(): Promise<JsonValue> {
  return JSON.parse(await repositoryFile("verification/quint/models.json")) as JsonValue;
}

describe("Quint model manifest", () => {
  test("lists every committed model with its actions, invariants, mutant, and replay test", async () => {
    const models = await readQuintModels();
    expect(models.length).toBeGreaterThan(0);
    const files = (await readdir(join(REPOSITORY_ROOT, "verification/quint"))).filter((name) => name.endsWith(".qnt"));
    expect(models.map((model) => model.file).sort()).toEqual(files.sort());
    for (const model of models) {
      const source = await repositoryFile(`verification/quint/${model.file}`);
      expect(source).toMatch(new RegExp(`^module ${model.module} \\{$`, "mu"));
      for (const action of [model.init, model.step, ...model.mutants.map((mutant) => mutant.step)]) {
        expect(source).toMatch(new RegExp(`^\\s*action ${action}\\b`, "mu"));
      }
      for (const invariant of model.invariants) expect(source).toMatch(new RegExp(`^\\s*val ${invariant}\\b`, "mu"));
      expect(model.mutants.length).toBeGreaterThan(0);
      const replay = await repositoryFile(model.replay.test);
      expect(replay).toContain(`"${model.file}"`);
      expect(replay).toContain("parseItfTrace");
    }
  });

  test("runs every model's replay test from the manifest, so a new model needs no script edit", async () => {
    const models = await readQuintModels();
    const scripts = (JSON.parse(await repositoryFile("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["verify:quint"]).toBe("bun run ./scripts/verification-tools.ts quint");
    expect(scripts[QUINT_REPLAY_SCRIPT]).toMatch(/^bun test --no-orphans --timeout \d+ --max-concurrency 1$/u);
    const tests = quintReplayTests(models);
    expect(tests).toEqual([...new Set(models.map((model) => `./${model.replay.test}`))]);
    expect(quintReplayCommand("/bin/bun", models)).toEqual(["/bin/bun", "run", QUINT_REPLAY_SCRIPT, ...tests]);
    for (const test of tests) expect(await repositoryFile(test.slice(2))).toContain("describe(");
    const lock = models.find((model) => model.file === "lock.qnt");
    if (lock === undefined) throw new Error("models.json does not list lock.qnt");
    // Two models may share one replay file; it runs once.
    expect(quintReplayTests([lock, lock, { ...lock, replay: { ...lock.replay, test: "scripts/other-replay.test.ts" } }]))
      .toEqual(["./scripts/verification-lock-replay.test.ts", "./scripts/other-replay.test.ts"]);
  });

  test("bounds trace generation inside the replay runner's timeout", async () => {
    const scripts = (JSON.parse(await repositoryFile("package.json")) as { scripts: Record<string, string> }).scripts;
    const runner = /(?:^| )--timeout (\d+)(?: |$)/u.exec(scripts[QUINT_REPLAY_SCRIPT] ?? "");
    expect(runner).not.toBeNull();
    // Trace generation runs inside the first replay test; the rest of that test needs a margin too.
    expect(QUINT_TRACE_TIMEOUT_MS + 15_000).toBeLessThanOrEqual(Number(runner![1]));
    // The whole replay run ends inside its own bound.
    expect(Number(runner![1])).toBeLessThan(QUINT_REPLAY_TIMEOUT_MS);
    const shared = await repositoryFile("scripts/verification-replay.ts");
    expect(shared.match(/timeoutMs:/gu)).toEqual(["timeoutMs:"]);
    expect(shared).toContain("timeoutMs: QUINT_TRACE_TIMEOUT_MS,");
    for (const test of quintReplayTests(await readQuintModels())) {
      const replay = await repositoryFile(test.slice(2));
      expect(replay).toContain("./verification-replay.js");
      expect(replay).not.toContain("runTool");
    }
  });

  test("builds the exact seeded simulation and trace commands", async () => {
    const [model] = await readQuintModels();
    if (model === undefined) throw new Error("models.json lists no model");
    expect(model.file).toBe("lock.qnt");
    expect(quintRunArguments(model, model.step, "mutualExclusion")).toEqual([
      "run", "--backend", "typescript", "--main", "lock", "--init", "init", "--step", "step",
      "--invariant", "mutualExclusion", "--max-samples", "2000", "--max-steps", "12", "--seed", "20260923", "lock.qnt",
    ]);
    expect(quintTraceArguments(model, "stepMutant", 1_000, "20260924", "/traces")).toEqual([
      "run", "--backend", "typescript", "--main", "lock", "--init", "init", "--step", "stepMutant",
      "--max-samples", "1000", "--max-steps", "12", "--seed", "20260924",
      "--mbt", "--n-traces", "1000", "--out-itf", "/traces/trace_{seq}.itf.json", "lock.qnt",
    ]);
  });

  test("rejects a manifest without a mutant, a replay test, or exact bounds", async () => {
    const document = await committedModels();
    const model = jsonAt(document, ["models", 0]);
    if (!isJsonObject(model)) throw new Error("models.json lists no model");
    const at = (path: JsonPath, value: JsonValue | undefined): JsonValue => jsonWith(document, ["models", 0, ...path], value);
    const cases: readonly (readonly [JsonValue, string])[] = [
      [[], "models.json must be an object"],
      [jsonWith(document, ["schema"], "ghostget-quint-models-v2"), "models.json has an unknown schema"],
      [jsonWith(document, ["models"], []), "models.json must list between 1 and 64 models"],
      [jsonWith(document, ["models"], Array.from({ length: 65 }, () => model)), "models.json must list between 1 and 64 models"],
      [jsonWith(document, ["models", 1], model), "models.json must not list a model twice"],
      [at(["file"], "../lock.qnt"), "models[0].file must name a .qnt file in verification/quint"],
      [at(["file"], "Lock.qnt"), "models[0].file must name a .qnt file in verification/quint"],
      [at(["module"], "1lock"), "models[0].module must be a Quint identifier"],
      [at(["invariants"], []), "models[0].invariants must be a non-empty list"],
      [at(["invariants"], ["mutualExclusion", "mutualExclusion"]), "models[0].invariants must not repeat an entry"],
      [at(["mutants"], []), "models[0].mutants must list at least one seeded defect"],
      [at(["mutants", 0, "step"], "step"), "models[0].mutants[0] must use a mutant step"],
      [at(["mutants", 0, "invariant"], "deadlockFree"), "models[0].mutants[0] must violate one of the model's invariants"],
      [at(["mutants", 1], jsonAt(document, ["models", 0, "mutants", 0])!), "models[0].mutants must not list a step and invariant twice"],
      [at(["replay", "test"], "scripts/../lock.test.ts"), "models[0].replay.test must be a repository test file"],
      [at(["replay", "test"], "scripts/verification-lock-replay.ts"), "models[0].replay.test must be a repository test file"],
      [at(["replay", "test"], "/tmp/replay.test.ts"), "models[0].replay.test must be a repository test file"],
      [at(["replay", "target"], "model"), "models[0].replay.target must be reference or production"],
      [at(["replay"], undefined), "models[0] must have exactly the fields"],
      [at(["simulation", "seed"], "0"), "models[0].simulation.seed must be a decimal seed string"],
      [at(["simulation", "seed"], "020260923"), "models[0].simulation.seed must be a decimal seed string"],
      [at(["simulation", "seed"], 20_260_923), "models[0].simulation.seed must be a decimal seed string"],
      [at(["simulation", "seed"], "9007199254740993"), "models[0].simulation.seed must be a decimal seed string"],
      [at(["simulation", "maxSamples"], 0), "models[0].simulation.maxSamples must be an integer from 1 to 100000"],
      [at(["simulation", "maxSamples"], 100_001), "models[0].simulation.maxSamples must be an integer from 1 to 100000"],
      [at(["simulation", "maxSteps"], 2.5), "models[0].simulation.maxSteps must be an integer from 1 to 100"],
      [at(["apalache", "length"], 51), "models[0].apalache.length must be an integer from 1 to 50"],
      [at(["replay", "traces"], 10_001), "models[0].replay.traces must be an integer from 1 to 10000"],
      [at(["replay", "seed"], "-1"), "models[0].replay.seed must be a decimal seed string"],
      [at(["replay", "maxSteps"], 0), "models[0].replay.maxSteps must be an integer from 1 to 100"],
    ];
    expect(() => parseQuintModels(document)).not.toThrow();
    for (const [candidate, message] of cases) expect(() => parseQuintModels(candidate)).toThrow(message);
  });

  test("rejects every type change, missing field, and unknown field", async () => {
    const document = await committedModels();
    assertProperty(fc.property(invalidatingMutation(document), (mutated) => rejects(() => parseQuintModels(mutated))));
  });
});

// ---------------------------------------------------------------------------
// Lean trust base
// ---------------------------------------------------------------------------

const LIBRARY = "GhostgetVerification";
const HELD_TYPE = `forall (q : ${LIBRARY}.Smoke.Proc) (p : ${LIBRARY}.Smoke.Proc), Eq.{1} (Option.{0} ${LIBRARY}.Smoke.Proc) (${LIBRARY}.Smoke.Lock.holder (${LIBRARY}.Smoke.acquire (${LIBRARY}.Smoke.Lock.mk (Option.some.{0} ${LIBRARY}.Smoke.Proc q)) p)) (Option.some.{0} ${LIBRARY}.Smoke.Proc q)`;
const REFUTATION_TYPE = `Not (${HELD_TYPE.replace(`${LIBRARY}.Smoke.acquire `, `${LIBRARY}.Smoke.acquireUnguarded `)})`;
const SCAN_PROOFS = parseLeanProofs({
  schema: "ghostget-lean-proofs-v2",
  library: LIBRARY,
  theorems: [
    { name: `${LIBRARY}.Smoke.acquire_held`, type: leanTypeDigest(HELD_TYPE) },
    { name: `${LIBRARY}.Smoke.acquireUnguarded_violates_held`, type: leanTypeDigest(REFUTATION_TYPE) },
  ],
  mutants: [{
    theorem: `${LIBRARY}.Smoke.acquire_held`,
    guarded: `${LIBRARY}.Smoke.acquire`,
    defect: `${LIBRARY}.Smoke.acquireUnguarded`,
    refutation: `${LIBRARY}.Smoke.acquireUnguarded_violates_held`,
  }],
  allowedAxioms: [`${LIBRARY}.Extra.choiceOracle`],
});

const TRUST_ESCAPES = [
  "skipKernelTC",
  "implemented_by",
  "native_decide",
  "ofReduceBool",
  "ofReduceNat",
  "trustCompiler",
  "addDeclWithoutChecking",
  "sorryAx",
] as const;
const FORBIDDEN_CODE = [
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
] as const;

const scan = (text: string): readonly string[] => leanSourceFindings(text, SCAN_PROOFS);

/** Audit lines in the exact shape `AxiomAudit.lean` prints for the smoke library. */
const LOCK_STEP_TYPE = `${LIBRARY}.Smoke.Lock -> ${LIBRARY}.Smoke.Proc -> ${LIBRARY}.Smoke.Lock`;
const AUDITED: readonly AuditedDeclaration[] = Object.freeze([
  {
    declaration: `${LIBRARY}.Smoke.acquire`,
    kind: "definition",
    module: `${LIBRARY}.Smoke`,
    type: LOCK_STEP_TYPE,
    axioms: [],
    uses: [`${LIBRARY}.Smoke.Lock`, `${LIBRARY}.Smoke.Proc`],
  },
  {
    declaration: `${LIBRARY}.Smoke.acquireUnguarded`,
    kind: "definition",
    module: `${LIBRARY}.Smoke`,
    type: LOCK_STEP_TYPE,
    axioms: [],
    uses: [`${LIBRARY}.Smoke.Lock`, `${LIBRARY}.Smoke.Proc`],
  },
  {
    declaration: `${LIBRARY}.Smoke.acquireUnguarded_violates_held`,
    kind: "theorem",
    module: `${LIBRARY}.Smoke`,
    type: REFUTATION_TYPE,
    axioms: [],
    uses: ["Eq", `${LIBRARY}.Smoke.Lock.holder`, `${LIBRARY}.Smoke.Lock.mk`, `${LIBRARY}.Smoke.Proc`, `${LIBRARY}.Smoke.acquireUnguarded`, "Not", "Option", "Option.some"],
  },
  {
    declaration: `${LIBRARY}.Smoke.acquire_held`,
    kind: "theorem",
    module: `${LIBRARY}.Smoke`,
    type: HELD_TYPE,
    axioms: ["propext"],
    uses: ["Eq", `${LIBRARY}.Smoke.Lock.holder`, `${LIBRARY}.Smoke.Lock.mk`, `${LIBRARY}.Smoke.Proc`, `${LIBRARY}.Smoke.acquire`, "Option", "Option.some"],
  },
]);

const MUTANT_CHECK: AuditedMutant = Object.freeze({
  theorem: `${LIBRARY}.Smoke.acquire_held`,
  guarded: `${LIBRARY}.Smoke.acquire`,
  defect: `${LIBRARY}.Smoke.acquireUnguarded`,
  refutation: `${LIBRARY}.Smoke.acquireUnguarded_violates_held`,
  found: true,
  sameSignature: true,
  negates: true,
});
const AUDIT: AxiomAudit = Object.freeze({ declarations: AUDITED, mutants: Object.freeze([MUTANT_CHECK]) });

const mutantLine = (check: AuditedMutant): string => JSON.stringify({
  defect: check.defect,
  found: check.found,
  guarded: check.guarded,
  mutant: check.theorem,
  negates: check.negates,
  refutation: check.refutation,
  sameSignature: check.sameSignature,
});

const auditText = (audit: AxiomAudit): string => [
  ...audit.declarations.map((entry) => JSON.stringify({
    axioms: entry.axioms,
    declaration: entry.declaration,
    kind: entry.kind,
    module: entry.module,
    type: entry.type,
    uses: entry.uses,
  })),
  ...audit.mutants.map(mutantLine),
  JSON.stringify({ declarations: audit.declarations.length, mutants: audit.mutants.length }),
  "",
].join("\n");

const withEntry = (
  name: string,
  change: (entry: AuditedDeclaration) => AuditedDeclaration | null,
): AxiomAudit => ({
  ...AUDIT,
  declarations: AUDITED.flatMap((entry) => {
    if (entry.declaration !== name) return [entry];
    const changed = change(entry);
    return changed === null ? [] : [changed];
  }),
});

const withCheck = (change: Partial<AuditedMutant> | null): AxiomAudit => ({
  ...AUDIT,
  mutants: change === null ? [] : [{ ...MUTANT_CHECK, ...change }],
});

describe("Lean trust base", () => {
  test("passes the static checks on the committed project", async () => {
    const { proofs, findings } = await leanStaticFindings();
    expect(findings).toEqual([]);
    expect(proofs.library).toBe(LIBRARY);
    // proofs.json pins the kernel statements shown in the fixtures: the refutation is the textual negation.
    expect(proofs.theorems.find((theorem) => theorem.name === `${LIBRARY}.Smoke.acquire_held`)?.type).toBe(leanTypeDigest(HELD_TYPE));
    expect(proofs.theorems.find((theorem) => theorem.name === `${LIBRARY}.Smoke.acquireUnguarded_violates_held`)?.type)
      .toBe(leanTypeDigest(REFUTATION_TYPE));
    // Later proofs add their own mutants; the smoke mutant stays among them.
    for (const mutant of SCAN_PROOFS.mutants) expect(proofs.mutants).toContainEqual(mutant);
    expect(proofs.theorems.length).toBeGreaterThan(0);
    expect(proofs.mutants.length).toBeGreaterThan(0);
    expect(proofs.allowedAxioms).toEqual([]);
  });

  test("scans the differential runner like the library and flags other root files", async () => {
    await withDirectory("gg-lean-scan-", async (root) => {
      const project = join(root, "verification", "lean");
      await cp(join(REPOSITORY_ROOT, "verification", "lean"), project, {
        recursive: true,
        filter: (source) => !source.split("/").includes(".lake"),
      });
      expect((await leanStaticFindings(root)).findings).toEqual([]);
      const runner = join(project, LEAN_DIFFERENTIAL_RUNNER);
      const text = await readFile(runner, "utf8");
      await writeFile(runner, `${text}\ntheorem leak : False := sorry\n#eval main\n`);
      expect((await leanStaticFindings(root)).findings)
        .toEqual([`${LEAN_DIFFERENTIAL_RUNNER} uses sorry`, `${LEAN_DIFFERENTIAL_RUNNER} uses #eval`]);
      await writeFile(runner, `import Lean.Elab\n${text}`);
      expect((await leanStaticFindings(root)).findings)
        .toEqual([`${LEAN_DIFFERENTIAL_RUNNER} imports Lean.Elab, outside the core-only allow-list`]);
      await rm(runner);
      expect((await leanStaticFindings(root)).findings).toEqual([`${LEAN_DIFFERENTIAL_RUNNER} is missing`]);
      await writeFile(join(project, "Other.lean"), text);
      expect((await leanStaticFindings(root)).findings)
        .toEqual([`${LEAN_DIFFERENTIAL_RUNNER} is missing`, "Other.lean is outside the GhostgetVerification library"]);
    });
    expect(LEAN_DIFFERENTIAL_TESTS.length).toBe(3);
    for (const file of LEAN_DIFFERENTIAL_TESTS) {
      expect(await readFile(join(REPOSITORY_ROOT, file), "utf8")).toContain("startLeanOracle");
    }
  });

  test("the encoding and negotiation Lean claims cite the differential test verify:lean runs", async () => {
    const register = JSON.parse(await repositoryFile("verification/claims.json")) as {
      claims: { id: string; layer: string; status: string; evidence: string[] }[];
    };
    const ids = ["canonical-json-injective", "hash-framing-injective", "session-secret-filename-injective", "edge-accept-406-only-when-empty"];
    const cited = register.claims.filter((claim) => ids.includes(claim.id))
      .map((claim) => ({ id: claim.id, layer: claim.layer, status: claim.status, cites: claim.evidence.includes(LEAN_DIFFERENTIAL_TEST) }))
      .sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id));
    expect(cited).toEqual(ids.map((id) => ({ id, layer: "lean", status: "evidenced", cites: true })));
    expect(await repositoryFile(LEAN_DIFFERENTIAL_TEST)).toContain("assertAsyncProperty(");
  });

  test("flags sorry, admit, native evaluation, unlisted axioms, and other trust escapes", () => {
    const cases: readonly (readonly [string, readonly string[]])[] = [
      ["theorem t : True := trivial\n", []],
      ["theorem t : False := sorry\n", ["uses sorry"]],
      ["theorem t : False := by admit\n", ["uses admit"]],
      ["theorem t : 2 + 2 = 4 := by native_decide\n", ["uses the trust escape native_decide"]],
      ["theorem t : 2 + 2 = 4 := by decide +native\n", ["uses native evaluation"]],
      ["set_option debug.skipKernelTC true\n", ["uses the trust escape skipKernelTC"]],
      ["@[implemented_by fastAcquire] def acquire := 1\n", ["uses the trust escape implemented_by"]],
      ["theorem t : False := Lean.ofReduceBool _ _ rfl\n", ["uses the trust escape ofReduceBool"]],
      ["theorem t : False := sorryAx False\n", ["uses the trust escape sorryAx"]],
      ["unsafe def f : Nat := 1\n", ["uses unsafe"]],
      ["@[extern \"c_acquire\"] opaque acquire : Nat → Nat\n", ["uses extern"]],
      ["#eval 1 + 1\n", ["uses #eval"]],
      ["elab \"probe\" : term => pure default\n", ["uses elab"]],
      ["initialize counter : IO.Ref Nat ← IO.mkRef 0\n", ["uses initialize"]],
      ["axiom bad : False\n", ["declares an axiom that proofs.json does not allow"]],
      ["private axiom bad : False\n", ["declares an axiom that proofs.json does not allow"]],
      ["axiom\n  bad : False\n", ["declares an axiom that proofs.json does not allow"]],
      ["axiom Other.choiceOracle : Nat\n", ["declares an axiom that proofs.json does not allow"]],
      ["axiom GhostgetVerification.Extra.choiceOracle : Nat\n", []],
      ["namespace GhostgetVerification.Extra\naxiom choiceOracle : Nat\nend GhostgetVerification.Extra\n", []],
      ["import Mathlib.Tactic\n", ["imports Mathlib.Tactic, outside the core-only allow-list"]],
      ["public import Lean.Elab\n", ["imports Lean.Elab, outside the core-only allow-list"]],
      ["import Init.Data.List Std.Data.HashMap\nimport GhostgetVerification.Smoke\n", []],
      ["-- import Mathlib\n-- sorry and admit in a comment\n/- unsafe /- nested elab -/ #eval -/\ntheorem t : True := trivial\n", []],
      ["-- native_decide in a comment still counts\n", ["uses the trust escape native_decide"]],
      ["def s : String := \"sorry\"\n", ["uses sorry"]],
      ["def s : String := r#\"admit \"quoted\"\"#\n", ["uses admit"]],
      ["theorem sorryFree : True := trivial\ndef admitted := 1\ndef elaborate := 2\ntheorem axiomFree : True := trivial\n", []],
      ["def c : Char := '\"'\ntheorem t : True := trivial\n", []],
      ["def s : String := \"/-\"\ntheorem t : False := sorry\n-- -/\n", ["uses sorry"]],
      ["-- \"\ntheorem t : False := sorry\n", ["uses sorry"]],
      ["/- unterminated\ntheorem t : False := sorry\n", ["has an unterminated block comment"]],
      ["def s : String := \"unterminated\n", ["has an unterminated string literal"]],
      ["def s : String := r##\"unterminated\"#\n", ["has an unterminated raw string literal"]],
    ];
    for (const [source, findings] of cases) expect([source, scan(source)]).toEqual([source, findings]);
  });

  test("flags every trust escape anywhere and every forbidden keyword in code", () => {
    for (const word of TRUST_ESCAPES) {
      expect(scan(`theorem t : True := ${word}\n`)).toContain(`uses the trust escape ${word}`);
      expect(scan(`-- ${word}\n`)).toEqual([`uses the trust escape ${word}`]);
      expect(scan(`theorem t : True := x${word}\n`)).toEqual([]);
    }
    for (const word of FORBIDDEN_CODE) {
      expect(scan(`${word} x\n`)).toContain(`uses ${word}`);
      expect(scan(`-- ${word}\n/- ${word} -/\n`)).toEqual([]);
      expect(scan(`def ${word.replace("#", "")}Free := ${word.replace("#", "")}_2\n`)).not.toContain(`uses ${word}`);
    }
    assertProperty(fc.property(
      fc.constantFrom(...FORBIDDEN_CODE),
      fc.array(fc.constantFrom(" ", "\n", "(", ")", "[", "]", ":= ", "by "), { maxLength: 4 }),
      fc.array(fc.constantFrom(" ", "\n", "(", ")", "[", "]", ","), { maxLength: 4 }),
      (word, before, after) => scan(`def t := 1\n${before.join("")}${word}${after.join("")}\n`).includes(`uses ${word}`),
    ));
  });

  test("flags the seeded sorry canary", () => {
    const canary = leanCanarySource(LIBRARY);
    expect(canary).toBe([
      `namespace ${LIBRARY}.${LEAN_CANARY_MODULE}`,
      "",
      "theorem canary : False := sorry",
      "",
      `end ${LIBRARY}.${LEAN_CANARY_MODULE}`,
      "",
    ].join("\n"));
    expect(scan(canary)).toEqual(["uses sorry"]);
  });

  test("blanks comments without moving code, and a comment alone yields only trust-escape findings", () => {
    const leanish = fc.array(
      fc.oneof(
        fc.constantFrom("-", "/", "\"", "'", "\\", "r", "#", "\n", " ", "x", "sorry", "--", "/-", "-/", "r#\"", "\"#"),
        fc.string({ maxLength: 4 }),
      ),
      { maxLength: 40 },
    ).map((parts) => parts.join(""));
    assertProperty(fc.property(leanish, (text) => {
      const { code } = leanCodeWithoutComments(text);
      if (code.length !== text.length) return false;
      for (let index = 0; index < text.length; index += 1) {
        if ((text[index] === "\n") !== (code[index] === "\n")) return false;
      }
      return true;
    }));
    assertProperty(fc.property(fc.string({ maxLength: 60 }).filter((text) => !text.includes("\n")), (text) =>
      scan(`-- ${text}`).every((finding) => finding.startsWith("uses the trust escape "))));
  });

  test("parses the axiom audit output strictly", () => {
    expect(parseAxiomAudit(auditText(AUDIT))).toEqual(AUDIT);
    const line = (entry: Record<string, unknown>): string => JSON.stringify(entry);
    const first = AUDITED[0]!;
    const one = '{"declarations":1,"mutants":0}';
    const check = mutantLine(MUTANT_CHECK);
    const cases: readonly (readonly [string, string])[] = [
      ["", "The axiom audit printed nothing"],
      ["\n\n", "The axiom audit printed nothing"],
      [`${line({ ...first })}\n`, "The axiom audit did not end with its summary line"],
      [`${line({ ...first })}\n{"declarations":1}\n`, "The axiom audit did not end with its summary line"],
      [`${line({ ...first })}\n{"declarations":1,"mutants":0,"extra":true}\n`, "The axiom audit did not end with its summary line"],
      [`${line({ ...first })}\n{"declarations":2,"mutants":0}\n`, "The axiom audit summary does not match its declarations"],
      [`${line({ ...first })}\n{"declarations":1,"mutants":1}\n`, "The axiom audit summary does not match its declarations"],
      [`${line({ ...first })}\n{"declarations":1,"mutants":-1}\n`, "The axiom audit summary does not match its declarations"],
      ['{"declarations":0,"mutants":0}\n', "The axiom audit summary does not match its declarations"],
      [`not json\n${one}\n`, "Axiom audit line 1 is not JSON"],
      [`${line({ ...first, kind: "lemma" })}\n${one}\n`, "Axiom audit line 1 is malformed"],
      [`${line({ ...first, axioms: [""] })}\n${one}\n`, "Axiom audit line 1 is malformed"],
      [`${line({ ...first, uses: "Nat" })}\n${one}\n`, "Axiom audit line 1 is malformed"],
      [`${line({ ...first, type: "" })}\n${one}\n`, "Axiom audit line 1 is malformed"],
      [`${line({ ...first, declaration: "" })}\n${one}\n`, "Axiom audit line 1 is malformed"],
      [`${line({ ...first, source: "x" })}\n${one}\n`, "axiom audit line 1 must have exactly the fields"],
      [`${line({ ...first })}\n${line({ ...first })}\n{"declarations":2,"mutants":0}\n`, "The axiom audit repeats a declaration"],
      // The mutant checks follow the declarations; a declaration where a check belongs is malformed.
      [`${line({ ...first })}\n${line({ ...first })}\n{"declarations":1,"mutants":1}\n`, "axiom audit line 2 must have exactly the fields"],
      [`${check}\n${line({ ...first })}\n{"declarations":1,"mutants":1}\n`, "axiom audit line 1 must have exactly the fields"],
      [`${line({ ...first })}\n${check.replace('"negates":true', '"negates":"yes"')}\n{"declarations":1,"mutants":1}\n`, "Axiom audit line 2 is malformed"],
      [`${line({ ...first })}\n${check.replace(`"defect":"${MUTANT_CHECK.defect}"`, '"defect":""')}\n{"declarations":1,"mutants":1}\n`, "Axiom audit line 2 is malformed"],
    ];
    for (const [text, message] of cases) expect(() => parseAxiomAudit(text)).toThrow(message);
  });

  test("audits required theorems, seeded defects, modules, and axioms", () => {
    const held = `${LIBRARY}.Smoke.acquire_held`;
    const refutation = `${LIBRARY}.Smoke.acquireUnguarded_violates_held`;
    const defect = `${LIBRARY}.Smoke.acquireUnguarded`;
    const acquire = `${LIBRARY}.Smoke.acquire`;
    expect(parseAxiomAudit(auditText(AUDIT))).toEqual(AUDIT);
    expect(axiomAuditFindings(AUDIT, SCAN_PROOFS)).toEqual([]);
    expect(axiomAuditArguments(SCAN_PROOFS)).toEqual([LIBRARY, held, acquire, defect, refutation]);
    const restated = `${HELD_TYPE.slice(0, -1)} p)`;
    expect(restated).not.toBe(HELD_TYPE);
    const cases: readonly (readonly [AxiomAudit, readonly string[]])[] = [
      [withEntry(held, () => null), [`${held} is missing`]],
      [withEntry(held, (entry) => ({ ...entry, kind: "definition" })), [`${held} is a definition, not a theorem`]],
      [withEntry(held, (entry) => ({ ...entry, type: restated })), [
        `${held} states something other than proofs.json records; review it and set its type to ${leanTypeDigest(restated)}`,
      ]],
      [withEntry(defect, () => null), [`the seeded defect ${defect} is missing`]],
      [withEntry(defect, (entry) => ({ ...entry, kind: "theorem" })), [`the seeded defect ${defect} is a theorem, not a definition`]],
      [withEntry(acquire, () => null), [`the guarded definition ${acquire} is missing`]],
      [withEntry(held, (entry) => ({ ...entry, uses: entry.uses.filter((name) => name !== acquire) })), [`${held} does not state anything about ${acquire}`]],
      // The kernel-term checks: a refutation that only mentions the defect, or a defect of another type, is not evidence.
      [withCheck({ negates: false }), [`${refutation} does not state the negation of ${held} with ${acquire} replaced by ${defect}`]],
      [withCheck({ sameSignature: false }), [`the seeded defect ${defect} does not have the type of ${acquire}`]],
      [withCheck({ found: false, negates: false }), [`the audit could not find every declaration of the seeded defect ${defect}`]],
      [withCheck({ refutation: held }), [
        `the audit checked the seeded defect ${defect} against ${held} 0 times, not once`,
      ]],
      [withCheck(null), [
        `the audit checked the seeded defect ${defect} against ${held} 0 times, not once`,
        "the audit checked 0 seeded defects, but proofs.json lists 1",
      ]],
      [{ ...AUDIT, mutants: [MUTANT_CHECK, MUTANT_CHECK] }, [
        `the audit checked the seeded defect ${defect} against ${held} 2 times, not once`,
        "the audit checked 2 seeded defects, but proofs.json lists 1",
      ]],
      [withEntry(held, (entry) => ({ ...entry, uses: [...entry.uses, defect] })), [`${held} states its property about the seeded defect ${defect}`]],
      [withEntry(refutation, (entry) => ({ ...entry, uses: entry.uses.filter((name) => name !== defect) })), [`${refutation} does not state anything about the seeded defect ${defect}`]],
      [withEntry(acquire, (entry) => ({ ...entry, module: "Mathlib.Order.Basic" })), [`${acquire} comes from Mathlib.Order.Basic, outside ${LIBRARY}`]],
      [withEntry(acquire, (entry) => ({ ...entry, module: `${LIBRARY}Extra.Smoke` })), [`${acquire} comes from ${LIBRARY}Extra.Smoke, outside ${LIBRARY}`]],
      [withEntry(acquire, (entry) => ({ ...entry, kind: "axiom" })), [
        `the guarded definition ${acquire} is an axiom, not a definition`,
        `${acquire} is an axiom that proofs.json does not allow`,
      ]],
      [withEntry(held, (entry) => ({ ...entry, axioms: ["sorryAx"] })), [`${held} depends on sorryAx`]],
      [withEntry(held, (entry) => ({ ...entry, axioms: ["Lean.ofReduceBool"] })), [`${held} depends on Lean.ofReduceBool`]],
      [withEntry(held, (entry) => ({ ...entry, axioms: ["Classical.em"] })), [`${held} depends on the unlisted axiom Classical.em`]],
      [withEntry(held, (entry) => ({ ...entry, axioms: [...KERNEL_AXIOMS, `${LIBRARY}.Extra.choiceOracle`] })), []],
      [{ ...AUDIT, declarations: [...AUDITED, {
        declaration: `${LIBRARY}.Extra.choiceOracle`, kind: "axiom", module: `${LIBRARY}.Extra`, type: "Nat", axioms: [`${LIBRARY}.Extra.choiceOracle`], uses: ["Nat"],
      }] }, []],
    ];
    for (const [declarations, findings] of cases) expect(axiomAuditFindings(declarations, SCAN_PROOFS)).toEqual(findings);
    assertProperty(fc.property(
      fc.constantFrom(...AUDITED.map((entry) => entry.declaration)),
      fc.constantFrom(...FORBIDDEN_AXIOMS),
      (name, axiom) => axiomAuditFindings(withEntry(name, (entry) => ({ ...entry, axioms: [...entry.axioms, axiom] })), SCAN_PROOFS)
        .includes(`${name} depends on ${axiom}`),
    ));
  });

  test("parses proofs.json strictly", async () => {
    const document = JSON.parse(await repositoryFile("verification/lean/proofs.json")) as JsonValue;
    expect(() => parseLeanProofs(document)).not.toThrow();
    const cases: readonly (readonly [JsonValue, string])[] = [
      [jsonWith(document, ["schema"], "ghostget-lean-proofs-v1"), "proofs.json has an unknown schema"],
      [jsonWith(document, ["library"], "ghostgetVerification"), "proofs.json library must be one Lean module root"],
      [jsonWith(document, ["library"], "Ghostget.Verification"), "proofs.json library must be one Lean module root"],
      [jsonWith(document, ["theorems"], []), "proofs.json theorems must be a non-empty list"],
      [jsonWith(document, ["theorems", 0], "GhostgetVerification.Smoke.acquire_free"), "proofs.json theorems[0] must be an object"],
      [jsonWith(document, ["theorems", 0, "name"], "Other.acquire_free"), "proofs.json theorems must live in the audited library"],
      [jsonWith(document, ["theorems", 0, "name"], "GhostgetVerification..acquire_free"), "proofs.json theorems[0].name must be a Lean name"],
      [jsonWith(document, ["theorems", 0, "type"], "A".repeat(64)), "proofs.json theorems[0].type must be the SHA-256 hex digest of the theorem's kernel type"],
      [jsonWith(document, ["theorems", 1, "name"], jsonAt(document, ["theorems", 0, "name"]) ?? null), "proofs.json theorems must not repeat a name"],
      [jsonWith(document, ["mutants"], []), "proofs.json mutants must list at least one seeded defect"],
      [jsonWith(document, ["mutants", 0, "defect"], "Other.acquireUnguarded"), "proofs.json mutants[0] must name declarations in the audited library"],
      [jsonWith(document, ["mutants", 0, "refutation"], jsonAt(document, ["mutants", 0, "theorem"]) ?? null), "proofs.json mutants[0] must name two different required theorems"],
      [jsonWith(document, ["mutants", 0, "refutation"], "GhostgetVerification.Smoke.unlisted"), "proofs.json mutants[0] must name two different required theorems"],
      [jsonWith(document, ["mutants", 0, "defect"], jsonAt(document, ["theorems", 0, "name"]) ?? null), "proofs.json mutants[0] defect must be a definition, not a required theorem"],
      [jsonWith(document, ["mutants", 0, "guarded"], jsonAt(document, ["theorems", 0, "name"]) ?? null), "proofs.json mutants[0] guarded must be a definition, not a required theorem"],
      [jsonWith(document, ["mutants", 0, "guarded"], jsonAt(document, ["mutants", 0, "defect"]) ?? null), "proofs.json mutants[0] defect must differ from the definition it stands in for"],
      [jsonWith(document, ["mutants", 0, "guarded"], "Other.acquire"), "proofs.json mutants[0] must name declarations in the audited library"],
      ...["sorryAx", "Lean.ofReduceBool", "Lean.trustCompiler", "propext", "Classical.choice"].map((axiom): readonly [JsonValue, string] => [
        jsonWith(document, ["allowedAxioms"], [axiom]),
        "proofs.json allowedAxioms may not list sorryAx, native-evaluation axioms, or the kernel axioms",
      ]),
    ];
    for (const [candidate, message] of cases) expect(() => parseLeanProofs(candidate)).toThrow(message);
    assertProperty(fc.property(invalidatingMutation(document), (mutated) => rejects(() => parseLeanProofs(mutated))));
  });

  test("allows only the pinned toolchain, no packages, and a plain library in the Lake project", async () => {
    const committed = {
      toolchain: await repositoryFile("verification/lean/lean-toolchain"),
      manifest: await repositoryFile("verification/lean/lake-manifest.json"),
      lakefile: await repositoryFile("verification/lean/lakefile.toml"),
    };
    expect(leanProjectFindings(committed)).toEqual([]);
    const library = "[[lean_lib]]\nname = \"GhostgetVerification\"\n";
    const header = "name = \"ghostget_verification\"\ndefaultTargets = [\"GhostgetVerification\"]\n\n";
    const cases: readonly (readonly [Partial<typeof committed>, readonly string[]])[] = [
      [{ toolchain: "leanprover/lean4:v4.33.0\n" }, ["lean-toolchain must be exactly leanprover/lean4:v4.34.0"]],
      [{ toolchain: "leanprover/lean4:v4.34.0" }, ["lean-toolchain must be exactly leanprover/lean4:v4.34.0"]],
      [{ toolchain: "leanprover/lean4:stable\n" }, ["lean-toolchain must be exactly leanprover/lean4:v4.34.0"]],
      [{ manifest: "{\"version\":\"1.2.0\",\"packages\":[{\"name\":\"mathlib\"}]}" }, ["lake-manifest.json must list no packages"]],
      [{ manifest: "{\"version\":\"1.2.0\"}" }, ["lake-manifest.json must list no packages"]],
      [{ manifest: "not json" }, ["lake-manifest.json must be JSON"]],
      [{ lakefile: `${header}${library}moreLeanArgs = ["-Ddebug.skipKernelTC=true"]\n` }, [
        "lakefile.toml uses the trust escape skipKernelTC",
        "lakefile.toml must declare one lean_lib with only name, roots, and globs",
      ]],
      [{ lakefile: `${header}${library}precompileModules = true\n` }, ["lakefile.toml must declare one lean_lib with only name, roots, and globs"]],
      [{ lakefile: `${header}${library}\n[[lean_lib]]\nname = "Other"\n` }, ["lakefile.toml must declare one lean_lib with only name, roots, and globs"]],
      [{ lakefile: `${header}${library}\n[[require]]\nname = "mathlib"\n` }, ["lakefile.toml may set only name, defaultTargets, and lean_lib"]],
      [{ lakefile: `moreServerArgs = ["-Dx"]\n${header}${library}` }, ["lakefile.toml may set only name, defaultTargets, and lean_lib"]],
      [{ lakefile: "name = \n" }, ["lakefile.toml must be TOML"]],
    ];
    for (const [change, findings] of cases) expect(leanProjectFindings({ ...committed, ...change })).toEqual(findings);
  });
});

// ---------------------------------------------------------------------------
// Sanitized logs
// ---------------------------------------------------------------------------

describe("sanitized checker logs", () => {
  test("removes terminal controls, local paths, and source-CI markers", () => {
    const replacements = [
      ["/home/runner", "<home>"],
      ["/home/runner/work/ghostget/ghostget", "<repository>"],
      ["/", "<root>"],
    ] as const;
    expect(sanitizeCheckerOutput(
      "\u001b[31mred\u001b[0m \u001b]8;;https://example.com\u0007link\u001b]8;;\u0007\r\nline\rfeed\ttab\u0000\u007f\u009b",
      [],
    )).toBe("red link\nlinefeed\ttab");
    expect(sanitizeCheckerOutput(
      "/home/runner/work/ghostget/ghostget/verification and /home/runner/.cache\n",
      replacements,
    )).toBe("<repository>/verification and <home>/.cache\n");
    expect(sanitizeCheckerOutput(
      "2026-09-23T00:00:00.0000000Z WRENCH_SOURCE_CI_IDENTITY={}\n[command]/usr/bin/git log -1 --format=%H\n",
      [],
    )).toBe("2026-09-23T00:00:00.0000000Z <source-ci-marker>{}\n<command>/usr/bin/git log -1 --format=%H\n");
  });

  test("never lets a replaced path, a marker, or a control character through", () => {
    const pathSegment = fc.constantFrom("a", "b", "tmp", "work", "home", ".cache", "x-y", "z_1");
    const prefix = fc.array(pathSegment, { minLength: 1, maxLength: 4 }).map((segments) => `/${segments.join("/")}`);
    const placeholder = fc.constantFrom("<work>", "<cache>", "<repository>", "<tmp>", "<home>");
    const input = fc.array(fc.tuple(prefix, placeholder), { minLength: 1, maxLength: 4 }).chain((replacements) => fc.tuple(
      fc.constant(replacements),
      fc.array(fc.oneof(
        fc.string({ unit: "binary", maxLength: 12 }),
        fc.constantFrom(...replacements.map(([path]) => path)),
        fc.constantFrom(
          "WRENCH_SOURCE_CI_IDENTITY=", "[command]", "\u001b[31m", "\u001b]8;;x\u0007", "\u001b", "\u009b",
          "\r\n", "\r", "\n", "\t", "\u0000", "\u007f", "/",
        ),
      ), { maxLength: 30 }).map((parts) => parts.join("")),
    ));
    assertProperty(fc.property(input, ([replacements, text]) => {
      const output = sanitizeCheckerOutput(text, replacements);
      return replacements.every(([path]) => !output.includes(path))
        && !output.includes("WRENCH_SOURCE_CI_IDENTITY=")
        && !output.includes("[command]")
        && !/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u.test(output)
        && sanitizeCheckerOutput(output, replacements) === output;
    }));
  });

  test("replaces every spelling of a path that reaches it through a symbolic link", async () => {
    await withDirectory("ghostget-paths-", async (directory) => {
      const real = join(directory, "real");
      const link = join(directory, "link");
      await mkdir(real);
      await symlink(real, link);
      const replacements = await pathReplacements([[link, "<work>"], [join(directory, "missing"), "<missing>"]]);
      expect(replacements).toEqual([
        [link, "<work>"],
        [await realpath(link), "<work>"],
        [join(directory, "missing"), "<missing>"],
      ]);
      expect(sanitizeCheckerOutput(`${link}/a ${await realpath(real)}/b`, replacements)).toBe("<work>/a <work>/b");
      expect(await pathReplacements([["/", "<root>"]])).toEqual([["/", "<root>"]]);
    });
  });

  test("keeps only the JDK identity from the property dump, which names the local user", () => {
    const dump = [
      "Property settings:",
      "    file.encoding = UTF-8",
      "    java.home = /opt/checkers/jdk",
      "    java.runtime.version = 21.0.12.1+1-LTS",
      "    java.vendor = Eclipse Adoptium",
      "    java.vendor.url = https://adoptium.net/",
      "    java.vendor.version = Temurin-21.0.12.1+1",
      "    user.dir = /home/someone/work",
      "    user.home = /home/someone",
      "    user.name = someone",
      "",
      "openjdk version \"21.0.12.1\" 2026-08-18 LTS",
      "OpenJDK Runtime Environment Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS)",
      "OpenJDK 64-Bit Server VM Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS, mixed mode, sharing)",
      "",
    ].join("\n");
    const identity = jdkIdentityLines(dump);
    expect(identity).toBe([
      "    java.runtime.version = 21.0.12.1+1-LTS",
      "    java.vendor = Eclipse Adoptium",
      "    java.vendor.version = Temurin-21.0.12.1+1",
      "openjdk version \"21.0.12.1\" 2026-08-18 LTS",
      "OpenJDK Runtime Environment Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS)",
      "OpenJDK 64-Bit Server VM Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS, mixed mode, sharing)",
    ].join("\n"));
    expect(identity).not.toContain("someone");
    expect(jdkIdentityMatches(identity)).toBeTrue();
    expect(jdkIdentityMatches(dump)).toBeTrue();
    const mismatches = [
      identity.replace("21.0.12.1+1-LTS", "21.0.8+9-LTS"),
      identity.replace("Eclipse Adoptium", "Oracle Corporation"),
      identity.replace("    java.vendor.version = Temurin-21.0.12.1+1", ""),
      identity.replace("Temurin-21.0.12.1+1\n", "Temurin-21.0.12.1+1 \n"),
      `${identity}\n    java.vendor = Eclipse Adoptium`,
      "",
    ];
    for (const text of mismatches) expect(jdkIdentityMatches(text)).toBeFalse();
  });
});

// ---------------------------------------------------------------------------
// Publication boundary
// ---------------------------------------------------------------------------

describe("publication boundary", () => {
  test("keeps verification, its scripts, checker output, and the assurance case out of the package", async () => {
    const manifest = JSON.parse(await repositoryFile("package.json")) as { files?: unknown };
    const files = manifest.files;
    if (!Array.isArray(files) || !files.every((entry): entry is string => typeof entry === "string")) {
      throw new Error("package.json must list its published files");
    }
    for (const entry of files.map((file) => file.replace(/^\.\//u, ""))) {
      expect(entry).not.toMatch(/[*?![\]{}]/u);
      expect(entry).not.toMatch(/^(?:verification|scripts|artifacts)(?:\/|$)/u);
      expect(["docs", "docs/", "docs/assurance.md"]).not.toContain(entry);
    }
  });

  test("keeps checker output and Lean build output out of Git", async () => {
    const ignored = (await repositoryFile(".gitignore")).split("\n");
    expect(ignored).toContain("artifacts/");
    expect(ignored).toContain("verification/lean/.lake/");
    const checkIgnore = (path: string): number => Bun.spawnSync(["git", "check-ignore", "--no-index", "-q", path], {
      cwd: REPOSITORY_ROOT,
      stdout: "ignore",
      stderr: "ignore",
    }).exitCode;
    expect(checkIgnore(`${VERIFICATION_ARTIFACTS}/quint/quint-run-lock-mutualExclusion.log`)).toBe(0);
    expect(checkIgnore("verification/lean/.lake/build/lib/lean/GhostgetVerification.olean")).toBe(0);
    for (const tracked of ["verification/claims.json", "verification/quint/lock.qnt", "verification/lean/proofs.json", "docs/assurance.md"]) {
      expect(checkIgnore(tracked)).toBe(1);
    }
  });
});
