import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { authorize, command, environmentAuthority, githubReader } from "./authority.ts";
import { archiveName, digest, object, requireValue, sha256, version } from "./contract.ts";
import { admitHandoff, sealHandoff, temporaryDirectory, type SigningReceipt } from "./handoff.ts";
import { entitlementsFor, inventory, machoPaths, plist, signatureDetails, validateSignature } from "./native.ts";

// Sole Apple-secret consumer on a fresh runner: no build hooks or bundle execution.
if (import.meta.main) {
  requireValue(process.argv.length === 2 && process.platform === "darwin" && process.arch === "arm64", "signing requires Apple Silicon macOS");
  const a = environmentAuthority(); authorize(a, githubReader());
  admitHandoff(temporaryDirectory("input"), a, "unsigned", process.env.DESKTOP_INPUT_RECEIPT_SHA256);
  const app = join(temporaryDirectory("tree"), "Ghostget.app");
  requireValue(sha256(JSON.stringify(inventory(app))) === digest(process.env.DESKTOP_PREPARED_SHA256), "prepared unsigned app changed");
  const team = process.env.APPLE_TEAM_ID ?? "", identity = (process.env.APPLE_SIGNING_IDENTITY_SHA1 ?? "").toLowerCase();
  requireValue(/^[A-Z0-9]{10}$/u.test(team), "a Developer ID team is required"); digest(identity, 40);
  const keyId = process.env.APPLE_API_KEY_ID ?? "", issuer = process.env.APPLE_API_ISSUER ?? "";
  requireValue(/^[A-Z0-9]{10}$/u.test(keyId) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(issuer), "notary API identity is required");
  const certificate = process.env.APPLE_CERTIFICATE_BASE64 ?? "", password = process.env.APPLE_CERTIFICATE_PASSWORD ?? "", privateKey = process.env.APPLE_API_PRIVATE_KEY ?? "";
  requireValue(certificate.length > 0 && certificate.length <= 128 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/u.test(certificate)
    && password.length > 0 && password.length <= 1024 && privateKey.length <= 16 * 1024 && privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n"), "complete signing credentials are required");
  const out = temporaryDirectory("signed"); mkdirSync(out, { mode: 0o700 });
  requireValue(command("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", join(app, "Contents/Info.plist")]).toString("utf8").trim() === version(a.tag), "bundle version differs");
  const scratch = realpathSync(mkdtempSync(join(process.env.RUNNER_TEMP ?? "/private/tmp", "ghostget-signing-"))), keychain = join(scratch, "signing.keychain-db"), keychainPassword = randomBytes(32).toString("hex");
  const safeEnvironment = { HOME: process.env.HOME ?? "", TMPDIR: scratch, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" };
  const apple = (program: string, args: string[], timeout = 60_000) => command(program, args, { environment: safeEnvironment, timeout, maximum: 1024 * 1024 });
  let createAttempted = false; let signing: SigningReceipt | undefined;
  try {
    writeFileSync(join(scratch, "certificate.p12"), Buffer.from(certificate, "base64"), { flag: "wx", mode: 0o600 });
    writeFileSync(join(scratch, "notary.p8"), privateKey, { flag: "wx", mode: 0o600 });
    createAttempted = true;
    apple("/usr/bin/security", ["create-keychain", "-p", keychainPassword, keychain]);
    apple("/usr/bin/security", ["set-keychain-settings", "-lut", "3600", keychain]);
    apple("/usr/bin/security", ["unlock-keychain", "-p", keychainPassword, keychain]);
    apple("/usr/bin/security", ["import", join(scratch, "certificate.p12"), "-k", keychain, "-P", password, "-T", "/usr/bin/codesign"]);
    apple("/usr/bin/security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", keychainPassword, keychain]);
    const identities = apple("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning", keychain]).toString("utf8");
    requireValue(identities.split("\n").some(line => line.includes(identity.toUpperCase()) && line.includes('"Developer ID Application:') && line.includes(`(${team})`)), "certificate is not the selected Developer ID Application identity");
    const paths = machoPaths(app); requireValue(paths.length >= 3, "bundled native code is missing");
    for (const path of paths.filter(path => path !== "Contents/MacOS/ghostget-desktop")) {
      const entitlements = join(scratch, "entitlements.plist"); writeFileSync(entitlements, plist(entitlementsFor(path)), { mode: 0o600 });
      apple("/usr/bin/codesign", ["--force", "--sign", identity, "--keychain", keychain, "--timestamp", "--options", "runtime", "--entitlements", entitlements, join(app, path)]);
      validateSignature(signatureDetails(join(app, path)), team);
    }
    const runtime = join(app, "Contents/Resources/ghostget-runtime");
    copyFileSync(join(runtime, "runtime-manifest.json"), join(runtime, "runtime-input-manifest.json"));
    const finalFiles = inventory(runtime).filter(file => file.path !== "runtime-manifest.json");
    writeFileSync(join(runtime, "runtime-manifest.json"), JSON.stringify({ schema: "ghostget.native-resources/1", bunVersion: "1.3.14", files: finalFiles.map(({ path, bytes, sha256 }) => ({ path, size: bytes, sha256 })) }));
    const signingFiles = paths.filter(path => path !== "Contents/MacOS/ghostget-desktop").map(path => ({ path, teamId: team, entitlements: entitlementsFor(path) }));
    writeFileSync(join(app, "Contents/Resources/desktop-signing-inventory.json"), JSON.stringify({ schema: "ghostget.desktop-signing/1", files: signingFiles }));
    apple("/usr/bin/codesign", ["--force", "--sign", identity, "--keychain", keychain, "--timestamp", "--options", "runtime", "--identifier", "com.ghostget.desktop", app]);
    apple("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]); validateSignature(signatureDetails(app), team, "com.ghostget.desktop");
    const submission = join(scratch, "notary-submission.zip"); apple("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, submission], 180_000);
    const notaryAuth = ["--key", join(scratch, "notary.p8"), "--key-id", keyId, "--issuer", issuer];
    const admitted = object(JSON.parse(apple("/usr/bin/xcrun", ["notarytool", "submit", submission, ...notaryAuth, "--output-format", "json"], 180_000).toString("utf8")));
    requireValue(typeof admitted.id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(admitted.id), "notary submission identity is missing");
    // Preserve the identifier before waiting so a timeout is reconciled without blind resubmission.
    writeFileSync(join(temporaryDirectory("tree"), "notary-submission.json"), JSON.stringify({ id: admitted.id, source: a.source, runId: a.runId, runAttempt: a.runAttempt }), { flag: "wx", mode: 0o600 });
    const response = object(JSON.parse(apple("/usr/bin/xcrun", ["notarytool", "wait", admitted.id, ...notaryAuth, "--timeout", "30m", "--output-format", "json"], 1_850_000).toString("utf8")));
    requireValue(response.status === "Accepted" && response.id === admitted.id, "notarization was not accepted for this submission");
    apple("/usr/bin/xcrun", ["stapler", "staple", app], 120_000); apple("/usr/bin/xcrun", ["stapler", "validate", app]);
    signing = { teamId: team, signingIdentitySha1: identity, notarization: { id: response.id, status: "Accepted", stapled: true },
      runtimeInventorySha256: sha256(readFileSync(join(runtime, "runtime-manifest.json"))),
      signingInventorySha256: sha256(readFileSync(join(app, "Contents/Resources/desktop-signing-inventory.json"))) };
  } finally {
    // Delete only this command's temporary keychain; never change the login keychain or search list.
    try { if (createAttempted) apple("/usr/bin/security", ["delete-keychain", keychain]); } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
  requireValue(signing !== undefined, "signing receipt is missing");
  // The exact distributable is sealed before a later runner may execute its code.
  command("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, join(out, archiveName(a.tag))], { timeout: 180_000 });
  sealHandoff(out, a, "signed", signing); authorize(a, githubReader());
  console.log("Developer ID signing and accepted stapled notarization completed; final distribution verification is still required.");
}
