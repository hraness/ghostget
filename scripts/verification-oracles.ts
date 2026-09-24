/**
 * Builds the Rust differential oracle and checks the golden vectors behind
 * `bun run verify:oracles`.
 *
 * The oracle builds with the pinned Rust toolchain and `cargo build --locked`,
 * so Cargo admits every crate only at the checksum `Cargo.lock` records. The
 * vector generator then reruns in `--check` mode and fails when a committed
 * vector file differs from what it generates. Sanitized logs go to
 * `artifacts/verification/oracles/`, which CI retains. The differential tests
 * that `verify:oracles` runs next drive the built oracle and the vectors
 * against the shipped TypeScript. This script and `verification/` are
 * development-only and are never packaged.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  REPOSITORY_ROOT,
  RUST_ORACLE,
  VECTOR_GENERATOR,
  VERIFICATION_ARTIFACTS,
  pathReplacements,
  requireFinished,
  runTool,
  sanitizeCheckerOutput,
  type CheckerResult,
  type PathReplacement,
} from "./verification-tools.js";

const VERSION_TIMEOUT_MS = 60_000;
/** A cold build fetches and compiles the `url` crate graph; a warm one is seconds. */
const BUILD_TIMEOUT_MS = 8 * 60_000;
const GENERATOR_TIMEOUT_MS = 2 * 60_000;

/** The exact `version` line of the built oracle. */
export const ORACLE_VERSION_LINE = `ghostget-oracle 0.0.0 url ${RUST_ORACLE.crates.url}`;

/**
 * Findings for the pin files: `rust-toolchain.toml` must name exactly the
 * pinned toolchain, and `Cargo.toml` must require exactly the pinned `url`.
 */
export function oraclePinFindings(files: Readonly<{ toolchain: string; manifest: string }>): readonly string[] {
  const findings: string[] = [];
  const toolchain = Bun.TOML.parse(files.toolchain) as { toolchain?: { channel?: unknown } };
  if (toolchain.toolchain?.channel !== RUST_ORACLE.toolchain) {
    findings.push(`rust-toolchain.toml must pin channel ${RUST_ORACLE.toolchain}`);
  }
  const manifest = Bun.TOML.parse(files.manifest) as {
    package?: { "rust-version"?: unknown; publish?: unknown };
    dependencies?: Record<string, unknown>;
  };
  if (manifest.package?.["rust-version"] !== RUST_ORACLE.toolchain) {
    findings.push(`Cargo.toml must set rust-version ${RUST_ORACLE.toolchain}`);
  }
  if (manifest.package?.publish !== false) findings.push("Cargo.toml must set publish = false");
  const dependencies = manifest.dependencies ?? {};
  const expected = Object.entries(RUST_ORACLE.crates).map(([name, version]) => [name, `=${version}`] as const);
  if (Object.keys(dependencies).length !== expected.length
    || expected.some(([name, requirement]) => dependencies[name] !== requirement)) {
    findings.push(`Cargo.toml must depend on exactly ${expected.map(([name, requirement]) => `${name} ${requirement}`).join(", ")}`);
  }
  return Object.freeze(findings);
}

/** True when `--version` output names exactly the pinned release. */
export function rustVersionMatches(tool: "rustc" | "cargo", stdout: string): boolean {
  return stdout.startsWith(`${tool} ${RUST_ORACLE.toolchain} `) || stdout.trim() === `${tool} ${RUST_ORACLE.toolchain}`;
}

type Context = Readonly<{
  root: string;
  artifacts: string;
  environment: Readonly<Record<string, string>>;
  replacements: readonly PathReplacement[];
}>;

function requireExecutable(name: string): string {
  const found = Bun.which(name);
  if (found === null) throw new Error(`${name} must be on PATH for verify:oracles`);
  return found;
}

async function run(
  context: Context,
  step: string,
  logName: string,
  command: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<CheckerResult> {
  const outcome = await runTool(command, { cwd, environment: context.environment, timeoutMs });
  const status = outcome.kind === "exited" ? `exit ${String(outcome.exitCode)}` : `${outcome.kind}: ${outcome.detail}`;
  const record = sanitizeCheckerOutput([
    `$ ${command.join(" ")}`,
    `# ${status}`,
    "## stdout",
    outcome.stdout,
    "## stderr",
    outcome.stderr,
    "",
  ].join("\n"), context.replacements);
  await writeFile(join(context.artifacts, `${logName}.log`), record, { mode: 0o644 });
  const result = requireFinished(step, outcome);
  if (result.exitCode !== 0) {
    console.log(record.split("\n").slice(-40).join("\n"));
    throw new Error(`${step} exited with ${String(result.exitCode)}`);
  }
  return result;
}

export async function verifyOracles(root: string = REPOSITORY_ROOT): Promise<void> {
  const oracle = join(root, RUST_ORACLE.directory);
  const findings = oraclePinFindings({
    toolchain: await readFile(join(oracle, "rust-toolchain.toml"), "utf8"),
    manifest: await readFile(join(oracle, "Cargo.toml"), "utf8"),
  });
  if (findings.length > 0) throw new Error(findings.join("; "));

  const cargo = requireExecutable("cargo");
  const rustc = requireExecutable("rustc");
  const python = requireExecutable("python3");
  const artifacts = join(root, VERIFICATION_ARTIFACTS, "oracles");
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  // rustup proxies and Cargo's registry cache resolve from HOME, CARGO_HOME,
  // and RUSTUP_HOME, so those pass through; nothing else from the caller does.
  const passthrough = Object.fromEntries(["CARGO_HOME", "RUSTUP_HOME"].flatMap((name) => {
    const value = process.env[name];
    return value === undefined || value === "" ? [] : [[name, value]];
  }));
  const directories = [...new Set([dirname(cargo), dirname(rustc), dirname(python), "/usr/bin", "/bin"])];
  const context: Context = {
    root,
    artifacts,
    environment: Object.freeze({
      HOME: homedir(),
      ...passthrough,
      PATH: directories.join(":"),
      RUSTC: rustc,
      CARGO_TERM_COLOR: "never",
      CARGO_INCREMENTAL: "0",
      PYTHONHASHSEED: "0",
      PYTHONDONTWRITEBYTECODE: "1",
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
    }),
    replacements: await pathReplacements([
      [root, "<repository>"],
      ...directories.filter((directory) => directory !== "/usr/bin" && directory !== "/bin")
        .map((directory): PathReplacement => [directory, "<tool-bin>"]),
      [tmpdir(), "<tmp>"],
      [homedir(), "<home>"],
    ]),
  };

  for (const tool of ["rustc", "cargo"] as const) {
    const result = await run(context, `${tool} --version`, `${tool}-version`, [
      tool === "rustc" ? rustc : cargo, "--version",
    ], oracle, VERSION_TIMEOUT_MS);
    if (!rustVersionMatches(tool, result.stdout)) {
      throw new Error(`${tool} must be ${RUST_ORACLE.toolchain}; found ${result.stdout.trim()}`);
    }
  }
  await run(context, "cargo build", "cargo-build", [
    cargo, "build", "--release", "--locked",
  ], oracle, BUILD_TIMEOUT_MS);
  const version = await run(context, "oracle version", "oracle-version", [
    join(root, RUST_ORACLE.binary), "version",
  ], oracle, VERSION_TIMEOUT_MS);
  if (version.stdout.trim() !== ORACLE_VERSION_LINE) {
    throw new Error(`The built oracle reports ${version.stdout.trim()}, not ${ORACLE_VERSION_LINE}`);
  }
  const pythonVersion = await run(context, "python3 --version", "python-version", [
    python, "--version",
  ], root, VERSION_TIMEOUT_MS);
  console.log(`oracle toolchain: rust ${RUST_ORACLE.toolchain}, url ${RUST_ORACLE.crates.url}, ${pythonVersion.stdout.trim()}`);
  const check = await run(context, "vector generator --check", "vectors-check", [
    python, VECTOR_GENERATOR.path, "--check",
  ], root, GENERATOR_TIMEOUT_MS);
  if (check.stdout.trim() !== "golden vectors are current") {
    throw new Error(`The vector generator did not confirm the committed vectors: ${check.stdout.trim()}`);
  }
}

if (import.meta.main) {
  if (process.argv.length !== 2) {
    console.error("usage: bun run ./scripts/verification-oracles.ts");
    process.exit(2);
  }
  try {
    await verifyOracles();
    console.log("oracle build and golden vector check passed");
  } catch (error) {
    console.error(`verify:oracles failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
