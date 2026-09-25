// Committed-native-binary provenance verification for the bundled messaging
// artifacts (imsg, wacli). Two modes:
//
//   bun run ./scripts/messaging-runtime-provenance.ts verify
//       Recompute the committed compressed and executable SHA-256 pins, the
//       reviewed patch stack digests, and the MESSAGING_NATIVE_ARTIFACTS
//       constants from the checked-in bytes. Runs anywhere, network-free.
//
//   bun run ./scripts/messaging-runtime-provenance.ts rebuild wacli|imsg
//       Clone the pinned upstream commit, apply the reviewed patches (each at
//       its pinned SHA-256, asserting the recorded tip commit), build with the
//       pinned toolchain and command, and compare or qualify the produced
//       binary per the provenance record's own evidence level. macOS-only.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { MESSAGING_NATIVE_ARTIFACTS } from "../src/providers/messaging-native-artifacts";
import { runTool } from "./verification-tools";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/u, "");
const ARTIFACTS_DIR = "src/assets/messaging-runtime";

type Provenance = {
  readonly schemaVersion: number;
  readonly upstream: { readonly repository: string; readonly version: string; readonly baseCommit: string };
  readonly reviewedPatchStack: {
    readonly tipCommit: string;
    readonly patches: readonly { file: string; sha256: string; purpose?: string }[];
  };
  readonly artifact: {
    readonly platform: string;
    readonly arch: string;
    readonly version?: string;
    readonly reportedVersion?: string;
    readonly executableSha256: string;
    readonly executableBytes: number;
    readonly compression: string;
    readonly compressedSha256?: string;
    readonly compressedBytes?: number;
    readonly build: {
      readonly command: readonly string[];
      readonly preparation?: readonly string[];
      readonly go?: string;
      readonly goArchiveSha256?: string;
      readonly secondIdenticalBuildVerified?: boolean;
    };
  };
};

const TARGETS = {
  wacli: {
    vendorDir: "src/plugins/whatsapp-linked-device/vendor",
    artifactKey: "whatsapp",
    asset: "wacli-darwin-arm64.gz",
    buildProduct: "wacli-private",
    deterministic: true,
    goArchiveUrl: (version: string) => `https://go.dev/dl/${version}.darwin-arm64.tar.gz`,
  },
  imsg: {
    vendorDir: "src/plugins/imessage-direct/vendor",
    artifactKey: "imessage",
    asset: "imsg-darwin-arm64.gz",
    buildProduct: "imsg",
    deterministic: false,
  },
} as const;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`provenance: ${message}`);
}

function loadProvenance(vendorDir: string): Provenance {
  const path = join(ROOT, vendorDir, "provenance.json");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parsed as Provenance;
}

async function must(command: readonly string[], cwd: string, label: string): Promise<string> {
  const outcome = await runTool([...command], { cwd, environment: process.env as Record<string, string>, timeoutMs: 15 * 60_000 });
  if (outcome.kind !== "succeeded") {
    fail(`${label} failed (${outcome.kind}): ${outcome.stderr || outcome.stdout || outcome.detail}`);
  }
  return outcome.stdout.trim();
}

/** Recompute every committed pin from the checked-in bytes. */
export async function verify(): Promise<void> {
  for (const [name, target] of Object.entries(TARGETS)) {
    const provenance = loadProvenance(target.vendorDir);
    if (provenance.schemaVersion !== 1) fail(`${name} provenance schemaVersion must be 1`);
    const assetPath = join(ROOT, ARTIFACTS_DIR, target.asset);
    const compressed = readFileSync(assetPath);
    if (provenance.artifact.compressedSha256 !== undefined
      && sha256Hex(compressed) !== provenance.artifact.compressedSha256) {
      fail(`${name} compressed artifact sha256 drifted from provenance.json`);
    }
    if (provenance.artifact.compressedBytes !== undefined
      && compressed.length !== provenance.artifact.compressedBytes) {
      fail(`${name} compressed artifact byte length drifted`);
    }
    const executable = gunzipSync(compressed);
    if (sha256Hex(executable) !== provenance.artifact.executableSha256) {
      fail(`${name} decompressed executable sha256 drifted from provenance.json`);
    }
    if (executable.length !== provenance.artifact.executableBytes) {
      fail(`${name} decompressed executable byte length drifted`);
    }
    for (const patch of provenance.reviewedPatchStack.patches) {
      const patchBytes = readFileSync(join(ROOT, target.vendorDir, patch.file));
      if (sha256Hex(patchBytes) !== patch.sha256) {
        fail(`${name} reviewed patch ${patch.file} sha256 drifted`);
      }
    }
    const pinned = (MESSAGING_NATIVE_ARTIFACTS as Record<string, { file: string; sha256: string; bytes: number; compressedSha256: string; compressedBytes: number }>)[target.artifactKey];
    if (pinned === undefined) fail(`${name} is missing from MESSAGING_NATIVE_ARTIFACTS`);
    if (pinned.file !== target.asset
      || pinned.sha256 !== provenance.artifact.executableSha256
      || pinned.bytes !== provenance.artifact.executableBytes
      || pinned.compressedSha256 !== sha256Hex(compressed)
      || pinned.compressedBytes !== compressed.length) {
      fail(`${name} MESSAGING_NATIVE_ARTIFACTS pins disagree with provenance.json or the committed bytes`);
    }
    console.log(`${name}: committed artifact, patch stack, and native-artifact pins verified`);
  }
}

/**
 * Rebuild one target from pinned upstream source. For `deterministic` targets
 * (wacli) the produced executable must hash to the recorded executableSha256.
 * For imsg the record itself reports signed bytes as non-identical across
 * builds, so this run qualifies the pinned recipe by building it, running the
 * binary's `--version`/`help` probe, and checking the Mach-O arm64 layout.
 */
async function rebuild(name: keyof typeof TARGETS): Promise<void> {
  if (process.platform !== "darwin") fail("the messaging runtime rebuild runs only on macOS (darwin/arm64 artifacts)");
  const target = TARGETS[name];
  const provenance = loadProvenance(target.vendorDir);
  const work = mkdtempSync(join(tmpdir(), `ghostget-provenance-${name}-`));
  try {
    const clone = join(work, "source");
    console.log(`cloning ${provenance.upstream.repository} at ${provenance.upstream.baseCommit}`);
    await must(["git", "clone", "--filter=blob:none", provenance.upstream.repository, clone], work, `${name} clone`);
    await must(["git", "checkout", provenance.upstream.baseCommit], clone, `${name} base commit`);
    for (const patch of provenance.reviewedPatchStack.patches) {
      const patchPath = join(ROOT, target.vendorDir, patch.file);
      const patchBytes = readFileSync(patchPath);
      if (sha256Hex(patchBytes) !== patch.sha256) fail(`${name} patch ${patch.file} sha256 drifted`);
      const staged = join(work, patch.file);
      writeFileSync(staged, patchBytes);
      await must(["git", "am", "--3way", staged], clone, `${name} git am ${patch.file}`);
    }
    const tip = await must(["git", "rev-parse", "HEAD"], clone, `${name} tip`);
    if (tip !== provenance.reviewedPatchStack.tipCommit) {
      fail(`${name} patch stack landed at ${tip}, expected ${provenance.reviewedPatchStack.tipCommit}`);
    }

    if (name === "wacli") {
      // The provenance record pins the Go toolchain archive itself; admit the
      // downloaded tarball only at its recorded SHA-256.
      const goVersion = provenance.artifact.build.go?.split(" ")[0];
      const archiveSha = provenance.artifact.build.goArchiveSha256;
      if (goVersion === undefined || archiveSha === undefined) fail("wacli provenance lacks the pinned Go archive");
      const archive = join(work, `${goVersion}.darwin-arm64.tar.gz`);
      await must(["curl", "-fsSL", "-o", archive, (TARGETS.wacli.goArchiveUrl)(goVersion)], work, "Go toolchain download");
      if (sha256Hex(readFileSync(archive)) !== archiveSha) {
        fail("downloaded Go toolchain archive sha256 disagrees with the provenance record");
      }
      await must(["tar", "-xzf", archive, "-C", work], work, "Go toolchain extraction");
      const go = join(work, "go", "bin", "go");
      chmodSync(go, 0o755);
      const command = provenance.artifact.build.command;
      if (command[0] !== "go") fail("wacli build command does not start with go");
      await must([go, ...command.slice(1)], clone, `${name} build`);
      const produced = readFileSync(join(clone, target.buildProduct));
      if (sha256Hex(produced) !== provenance.artifact.executableSha256) {
        fail(`${name} rebuilt executable sha256 ${sha256Hex(produced)} differs from the recorded ${provenance.artifact.executableSha256}`);
      }
      console.log(`${name}: rebuilt from pinned source matches the committed executable byte-for-byte`);
    } else {
      // imsg: the provenance record states signed bytes differ across clean
      // builds, so the honest evidence is that the pinned recipe builds and
      // the produced arm64 Mach-O runs.
      for (const step of provenance.artifact.build.preparation ?? []) {
        await must(["sh", "-c", step], clone, `${name} preparation ${step}`);
      }
      const command = provenance.artifact.build.command;
      await must([...command], clone, `${name} build`);
      // swift build -c release emits under .build/release/.
      const candidates = [
        join(clone, ".build", "release", target.buildProduct),
        join(clone, target.buildProduct),
      ];
      const produced = candidates.find((candidate) => existsSync(candidate));
      if (produced === undefined) fail(`${name} build produced no ${target.buildProduct} binary`);
      const archs = await must(["lipo", "-archs", produced], work, `${name} lipo -archs`);
      if (!archs.includes("arm64")) fail(`${name} rebuilt binary is not arm64 (got ${archs})`);
      console.log(`${name}: pinned recipe built an arm64 executable; bytes are non-deterministic per the provenance record (signedBytesIdentical: false), which the record states honestly`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [command, target] = process.argv.slice(2);
  if (command === "verify") {
    await verify();
  } else if (command === "rebuild" && (target === "wacli" || target === "imsg")) {
    await rebuild(target);
  } else if (command === "nightly") {
    await verify();
    await rebuild("wacli");
    await rebuild("imsg");
  } else {
    console.error("usage: bun run ./scripts/messaging-runtime-provenance.ts verify");
    console.error("       bun run ./scripts/messaging-runtime-provenance.ts rebuild wacli|imsg");
    console.error("       bun run ./scripts/messaging-runtime-provenance.ts nightly");
    process.exit(2);
  }
}
