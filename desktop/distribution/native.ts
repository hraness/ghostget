import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { command } from "./authority.ts";
import { object, requireValue, sha256 } from "./contract.ts";

export const BUN_ENTITLEMENTS = Object.freeze({ "com.apple.security.cs.allow-jit": true });
export const CREDENTIAL_ENTITLEMENTS = BUN_ENTITLEMENTS;
export function entitlementsFor(path: string): Readonly<Record<string, boolean>> {
  if (path === "Contents/Resources/ghostget-runtime/ghostget-bun") return BUN_ENTITLEMENTS;
  if (path === "Contents/Resources/ghostget-runtime/ghostget-credential-bun") return CREDENTIAL_ENTITLEMENTS;
  return Object.freeze({});
}
export const plist = (value: Readonly<Record<string, boolean>>): string => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${Object.entries(value).map(([key, enabled]) => `<key>${key}</key><${enabled ? "true" : "false"}/>`).join("")}</dict></plist>\n`;
export function isMachO(bytes: Uint8Array): boolean {
  const magic = Buffer.from(bytes.subarray(0, 4)).toString("hex");
  return ["feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(magic);
}
export type FileEntry = Readonly<{ path: string; bytes: number; sha256: string; macho: boolean }>;
export function inventory(root: string): FileEntry[] {
  let total = 0; const files: FileEntry[] = [];
  const walk = (directory: string, depth: number): void => {
    requireValue(depth <= 64, "bundle tree is too deep");
    for (const name of readdirSync(directory).sort()) {
      requireValue(!/[\0\r\n]/u.test(name), "bundle path is invalid");
      const path = join(directory, name), info = lstatSync(path);
      requireValue(!info.isSymbolicLink(), "bundle symlinks require a reviewed layout");
      if (info.isDirectory()) { walk(path, depth + 1); continue; }
      requireValue(info.isFile() && info.nlink === 1 && files.length < 150_000 && info.size <= 512 * 1024 * 1024, "bundle file is unsafe or oversized");
      total += info.size; requireValue(total <= 3 * 1024 * 1024 * 1024, "bundle exceeds its byte bound");
      const bytes = readFileSync(path); requireValue(bytes.length === info.size, "bundle changed during read");
      files.push({ path: relative(root, path), bytes: bytes.length, sha256: sha256(bytes), macho: isMachO(bytes) });
    }
  };
  const info = lstatSync(root); requireValue(info.isDirectory() && !info.isSymbolicLink(), "bundle root is unsafe");
  walk(root, 0); return files;
}
export function machoPaths(root: string): string[] {
  // Inventory every Mach-O regardless of filename or nonstandard resource position.
  return inventory(root).filter(file => file.macho).map(file => file.path).sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b));
}
export function signatureDetails(path: string): string {
  const result = spawnSync("/usr/bin/codesign", ["--display", "--verbose=4", path], { env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" }, timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  requireValue(result.error === undefined && result.status === 0 && result.signal === null, "signature inspection failed");
  return Buffer.concat([result.stdout, result.stderr]).toString("utf8");
}
export function validateSignature(details: string, team: string, expectedIdentifier?: string): void {
  requireValue(details.split("\n").includes(`TeamIdentifier=${team}`) && /^Authority=Developer ID Application: .+$/mu.test(details)
    && /^Timestamp=.+$/mu.test(details) && /^CodeDirectory .*flags=0x[0-9a-f]+\([^\n]*runtime[^\n]*\)/mu.test(details)
    && !/^Signature=adhoc$/mu.test(details) && (expectedIdentifier === undefined || details.split("\n").includes(`Identifier=${expectedIdentifier}`)), "Developer ID, team, timestamp or hardened runtime differs");
}
export function verifyNativeBundle(app: string, team: string, identity: string): void {
  requireValue(process.platform === "darwin" && process.arch === "arm64", "requires an Apple Silicon macOS verifier");
  command("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  validateSignature(signatureDetails(app), team, "com.ghostget.desktop");
  for (const path of machoPaths(app)) {
    const absolute = join(app, path); command("/usr/bin/codesign", ["--verify", "--strict", absolute]);
    validateSignature(signatureDetails(absolute), team);
    const scratch = mkdtempSync("/private/tmp/ghostget-signature-");
    try {
      command("/usr/bin/codesign", ["--display", "--extract-certificates", join(scratch, "cert"), absolute]);
      requireValue(createHash("sha1").update(readFileSync(join(scratch, "cert0"))).digest("hex") === identity, "Developer ID leaf certificate differs");
    } finally { rmSync(scratch, { recursive: true, force: true }); }
    const result = spawnSync("/usr/bin/codesign", ["--display", "--entitlements", ":-", absolute], { env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" }, timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    requireValue(result.error === undefined && result.status === 0 && result.signal === null, "entitlement inspection failed");
    const output = Buffer.concat([result.stdout, result.stderr]).toString("utf8"), start = output.indexOf("<?xml"), end = output.indexOf("</plist>");
    const actual = start < 0 ? {} : object(JSON.parse(command("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], { input: output.slice(start, end + 8) }).toString("utf8")));
    requireValue(JSON.stringify(Object.entries(actual).sort()) === JSON.stringify(Object.entries(entitlementsFor(path)).sort()), "unexpected executable entitlements");
  }
  for (const path of ["Contents/MacOS/ghostget-desktop", "Contents/Resources/ghostget-runtime/ghostget-bun", "Contents/Resources/ghostget-runtime/ghostget-credential-bun"]) {
    requireValue(command("/usr/bin/lipo", ["-archs", join(app, path)]).toString("utf8").trim() === "arm64", "native architecture differs");
  }
  command("/usr/bin/xcrun", ["stapler", "validate", app]);
  command("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
  command("/usr/bin/syspolicy_check", ["distribution", app], { timeout: 120_000 });
}
