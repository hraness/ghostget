// @bun
import {
  __require
} from "./index-z1w83f81.js";

// src/cookie-chromium-mac.ts
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join as join2 } from "path";
import { getCookies } from "@steipete/sweet-cookie";

// src/cookie-safe-storage.ts
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
var COOKIE_READER_HELPER_NAME = "ghostget-cookie-reader";
var APP_NAME = "Ghostget";
var APP_ID = "ghostget";
var RUNNER_TIMEOUT_MS = 30000;
function localAppEnabled(environment, platform = process.platform) {
  return platform === "darwin" && environment.HRANESS_LOCAL_APP === "1";
}
function localAppHelperPath(appPath, helperName = COOKIE_READER_HELPER_NAME) {
  return join(appPath, "Contents", "Helpers", helperName);
}
var CHROME_SAFE_STORAGE = {
  account: "Chrome",
  services: ["Chrome Safe Storage"],
  label: "Chrome Safe Storage"
};
var CHROMIUM_SAFE_STORAGE = Object.freeze({
  chrome: CHROME_SAFE_STORAGE,
  brave: { account: "Brave", services: ["Brave Safe Storage"], label: "Brave Safe Storage" },
  arc: { account: "Arc", services: ["Arc Safe Storage"], label: "Arc Safe Storage" },
  chromium: { account: "Chromium", services: ["Chromium Safe Storage"], label: "Chromium Safe Storage" },
  dia: { account: "Dia", services: ["Dia Safe Storage"], label: "Dia Safe Storage" },
  edge: { account: "Microsoft Edge", services: ["Microsoft Edge Safe Storage", "Microsoft Edge"], label: "Microsoft Edge Safe Storage" }
});
function safeStorageWarning(label, kind) {
  const reason = kind === "denied" ? "user canceled" : kind === "unavailable" ? "interaction is not allowed" : kind === "missing" ? "could not be found" : "the keychain could not be read";
  return `Failed to read macOS Keychain (${label}): ${reason}.`;
}
var APP_RESULT_FRAME_BYTES = 64 * 1024;

class LocalAppError extends Error {
  name = "LocalAppError";
  code;
  constructor(code, message, options) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
  }
}
function runRunner(binary, args, input, timeoutMs = RUNNER_TIMEOUT_MS) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill("SIGKILL");
      rejectPromise(new LocalAppError("runner-failed", "The local app runner could not be started."));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      finish(null);
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new LocalAppError("runner-failed", "The local app runner could not be started.", { cause: error }));
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > APP_RESULT_FRAME_BYTES) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("close", (code) => finish(code));
    if (input === undefined)
      child.stdin.end();
    else
      child.stdin.end(`${input}
`);
  });
}
function firstJsonLine(stdout) {
  const line = stdout.split(`
`, 1)[0]?.trim() ?? "";
  if (line === "")
    return null;
  try {
    const parsed = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
async function defaultFileSha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
function helperOverride(environment) {
  const helper = environment.GHOSTGET_HELPER === "" ? undefined : environment.GHOSTGET_HELPER;
  const legacy = environment.GHOSTGET_MENUBAR === "" ? undefined : environment.GHOSTGET_MENUBAR;
  if (helper !== undefined && legacy !== undefined && helper !== legacy) {
    throw new LocalAppError("runner-failed", "GHOSTGET_HELPER and GHOSTGET_MENUBAR name different executables. Unset GHOSTGET_MENUBAR.");
  }
  const override = helper ?? legacy;
  if (override === undefined)
    return;
  if (!isAbsolute(override) || normalize(override) !== override) {
    throw new LocalAppError("runner-failed", `${helper !== undefined ? "GHOSTGET_HELPER" : "GHOSTGET_MENUBAR"} must be an absolute, normalized path to a reviewed helper executable.`);
  }
  return override;
}
async function defaultRunnerBinary(environment) {
  const override = helperOverride(environment);
  if (override !== undefined)
    return override;
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const resolver = join(basename(moduleDirectory) === "dist" ? join(dirname(moduleDirectory), "src") : moduleDirectory, "cookie-companion-resolve.ts");
  const result = await runRunner(process.execPath, ["--no-env-file", "--no-install", resolver]);
  const line = firstJsonLine(result.stdout);
  if (result.code !== 0 || line?.type !== "runner-result" || typeof line.path !== "string" || !isAbsolute(line.path) || normalize(line.path) !== line.path) {
    throw new LocalAppError("runner-failed", "The reviewed helper executable could not be resolved, so Ghostget can't build its app yet.");
  }
  return line.path;
}
async function defaultSidecarPath(environment) {
  const override = environment.HRANESS_LOCAL_CUSTODY_CLI_PATH;
  if (override !== undefined && override !== "")
    return resolve(override);
  try {
    return (await import("@hraness/local-custody/custody-rust")).sidecarBinaryPath();
  } catch (error) {
    throw new LocalAppError("assemble-failed", `The packaged cookie reader is not installed with Ghostget or has no build for ${process.platform}-${process.arch}.`, { cause: error });
  }
}
async function assembleLocalApp(environment, dependencies = {}) {
  const runner = dependencies.runnerBinary ?? await (dependencies.resolveRunnerBinary ?? (() => defaultRunnerBinary(environment)))();
  const run = dependencies.run ?? runRunner;
  const fileSha256 = dependencies.fileSha256 ?? defaultFileSha256;
  const identity = await run(runner, ["--signing-identity", "ensure"]);
  const identityLine = firstJsonLine(identity.stdout);
  if (identity.code !== 0 || identityLine?.type !== "signing-identity" || identityLine.state !== "ready") {
    throw new LocalAppError("identity-unavailable", "The local signing identity is not available, so Ghostget can't build its app yet.");
  }
  const sidecarPath = dependencies.sidecarPath ?? await (dependencies.resolveSidecarPath ?? (() => defaultSidecarPath(environment)))();
  const sidecarSha256 = await fileSha256(sidecarPath);
  const request = JSON.stringify({
    type: "app-request",
    version: 1,
    appId: APP_ID,
    name: APP_NAME,
    productVersion: dependencies.productVersion ?? "0.0.0",
    helpers: [{ name: COOKIE_READER_HELPER_NAME, path: sidecarPath, sha256: sidecarSha256 }],
    signing: "local"
  });
  const first = parseAppResult(await run(runner, ["--assemble-app"], request));
  const confirmed = first.status === "unchanged" ? first : parseAppResult(await run(runner, ["--assemble-app"], request));
  if (confirmed.status !== "unchanged" || confirmed.appPath !== first.appPath) {
    throw new LocalAppError("helper-mismatch", "The signed cookie reader inside Ghostget's app did not match the packaged helper.");
  }
  const helperPath = localAppHelperPath(first.appPath);
  const verifySignature = dependencies.verifyHelperSignature ?? defaultVerifyHelperSignature;
  if (!await verifySignature(helperPath, COOKIE_READER_HELPER_IDENTIFIER)) {
    throw new LocalAppError("helper-mismatch", "The signed cookie reader inside Ghostget's app did not match the packaged helper.");
  }
  return { appPath: first.appPath, helperPath };
}
var COOKIE_READER_HELPER_IDENTIFIER = `app.hraness.${APP_ID}.${COOKIE_READER_HELPER_NAME}`;
function parseAppResult(result) {
  const line = firstJsonLine(result.stdout);
  const status = line?.status;
  const appPath = typeof line?.path === "string" ? line.path : undefined;
  if (result.code !== 0 || line?.type !== "app-result" || status !== "built" && status !== "unchanged" || appPath === undefined || !isAbsolute(appPath)) {
    const code = typeof line?.code === "string" ? line.code : "assemble-failed";
    throw new LocalAppError(code === "identity-unavailable" ? "identity-unavailable" : "assemble-failed", `Ghostget's local app could not be built (${code}).`);
  }
  return { status, appPath };
}
async function defaultVerifyHelperSignature(helperPath, identifier) {
  const result = await runRunner("/usr/bin/codesign", ["--verify", "--strict", `-R=identifier "${identifier}"`, helperPath]);
  return result.code === 0;
}
var assemblyPromise;
function ensureLocalApp(environment, dependencies = {}) {
  assemblyPromise ??= assembleLocalApp(environment, dependencies);
  return assemblyPromise;
}

// src/cookie-chromium-mac.ts
var CHROME_SAFE_STORAGE_LABEL = "Chrome Safe Storage";
function keychainBridgeScript(helperPath) {
  if (helperPath.length === 0 || !helperPath.startsWith("/") || /['\u0000-\u001f']/u.test(helperPath)) {
    throw new Error("the signed cookie reader path must be absolute and single-quotable");
  }
  return `#!/bin/sh
# Ghostget's signed keychain bridge. It answers only
# \`security find-generic-password -w -a <account> -s <service>\` by asking the
# signed helper inside Ghostget.app, so macOS names Ghostget in the prompt.
# Every other invocation exits nonzero.
if [ "$1" != "find-generic-password" ]; then
  exit 2
fi
account=""
service=""
shift
while [ $# -gt 0 ]; do
  case "$1" in
    -w) shift ;;
    -a) [ $# -ge 2 ] || exit 2; account="$2"; shift 2 ;;
    -s) [ $# -ge 2 ] || exit 2; service="$2"; shift 2 ;;
    *) exit 2 ;;
  esac
done
if [ -z "$account" ] || [ -z "$service" ]; then
  exit 2
fi
# Only the known Safe Storage selectors are forwarded, so the request JSON is
# always well formed and this bridge cannot probe arbitrary keychain items.
case "$account" in
  Chrome|Brave|Arc|Chromium|Dia|"Microsoft Edge") ;;
  *) exit 2 ;;
esac
case "$service" in
  "Chrome Safe Storage"|"Brave Safe Storage"|"Arc Safe Storage"|"Chromium Safe Storage"|"Dia Safe Storage"|"Microsoft Edge Safe Storage"|"Microsoft Edge") ;;
  *) exit 2 ;;
esac
response=$(printf '%s\\n' "{\\"op\\":\\"generic_password_read\\",\\"service\\":\\"$service\\",\\"account\\":\\"$account\\"}" | '${helperPath}' 2>/dev/null)
case "$response" in
  *'"contentBase64":"'*)
    encoded=$(printf '%s' "$response" | /usr/bin/sed -n 's/.*"contentBase64":"\\([A-Za-z0-9+/=]*\\)".*/\\1/p')
    if [ -z "$encoded" ]; then
      echo "the signed cookie reader returned no credential" >&2
      exit 1
    fi
    printf '%s' "$encoded" | /usr/bin/base64 --decode
    exit 0
    ;;
esac
code=$(printf '%s' "$response" | /usr/bin/sed -n 's/.*"code":"\\([^"]*\\)".*/\\1/p')
case "$code" in
  denied)
    echo "The user name or passphrase you entered is not correct." >&2
    exit 128
    ;;
  missing)
    echo "The specified item could not be found in the keychain." >&2
    exit 44
    ;;
  interaction-not-allowed)
    echo "User interaction is not allowed." >&2
    exit 36
    ;;
  *)
    echo "The keychain could not be read." >&2
    exit 1
    ;;
esac
`;
}
function ensureKeychainBridge(helperPath, bridgeDirectory = defaultBridgeDirectory) {
  const directory = bridgeDirectory();
  const shimPath = join2(directory, "security");
  const content = keychainBridgeScript(helperPath);
  let current = null;
  try {
    current = readFileSync(shimPath, "utf8");
  } catch {}
  if (current !== content) {
    writeFileSync(shimPath, content, { mode: 448 });
    chmodSync(shimPath, 448);
  }
  return directory;
}
var processBridgeDirectory;
function defaultBridgeDirectory() {
  if (processBridgeDirectory === undefined) {
    processBridgeDirectory = mkdtempSync(join2(tmpdir(), "ghostget-keychain-bridge-"));
    const directory = processBridgeDirectory;
    process.once("exit", () => {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {}
    });
  }
  return processBridgeDirectory;
}
async function withBridgedSecurity(bridgeDirectory, run) {
  const previous = process.env.PATH;
  process.env.PATH = `${bridgeDirectory}:${previous ?? ""}`;
  try {
    return await run();
  } finally {
    if (previous === undefined)
      delete process.env.PATH;
    else
      process.env.PATH = previous;
  }
}
var BRIDGED_BROWSERS = new Set(["chrome", "edge"]);
function bridgedLabels(options) {
  const browsers = Array.isArray(options.browsers) ? options.browsers.filter((browser) => typeof browser === "string") : [];
  const chromium = typeof options.chromiumBrowser === "string" ? options.chromiumBrowser : undefined;
  const labels = new Set;
  if (chromium !== undefined) {
    const selector = CHROMIUM_SAFE_STORAGE[chromium];
    if (selector !== undefined)
      labels.add(selector.label);
  }
  for (const browser of browsers) {
    if (chromium !== undefined && browser === "chrome")
      continue;
    const selector = CHROMIUM_SAFE_STORAGE[browser];
    if (selector !== undefined)
      labels.add(selector.label);
  }
  if (labels.size === 0)
    labels.add(CHROME_SAFE_STORAGE_LABEL);
  return [...labels];
}
function keychainReadWouldHappen(options) {
  if (typeof options.chromiumBrowser === "string")
    return true;
  if (!Array.isArray(options.browsers)) {
    return true;
  }
  return options.browsers.some((browser) => typeof browser === "string" && BRIDGED_BROWSERS.has(browser));
}
function createSignedCookieStore(environment, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const base = dependencies.getCookies ?? ((options) => getCookies(options));
  return async (options) => {
    const selection = typeof options === "object" && options !== null ? options : {};
    if (!localAppEnabled(environment, platform) || !keychainReadWouldHappen(selection)) {
      return base(options);
    }
    let assembled;
    try {
      assembled = await (dependencies.ensureApp ?? ensureLocalApp)(environment);
    } catch {
      return {
        cookies: [],
        warnings: bridgedLabels(selection).map((label) => safeStorageWarning(label, "error"))
      };
    }
    let directory;
    try {
      directory = ensureKeychainBridge(assembled.helperPath, dependencies.bridgeDirectory ?? defaultBridgeDirectory);
    } catch {
      return {
        cookies: [],
        warnings: bridgedLabels(selection).map((label) => safeStorageWarning(label, "error"))
      };
    }
    return withBridgedSecurity(directory, () => base(options));
  };
}
function resetKeychainBridge() {
  if (processBridgeDirectory !== undefined && existsSync(processBridgeDirectory)) {
    rmSync(processBridgeDirectory, { recursive: true, force: true });
  }
  processBridgeDirectory = undefined;
}
export {
  resetKeychainBridge,
  keychainBridgeScript,
  ensureKeychainBridge,
  createSignedCookieStore
};
