import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { requireValue } from "./contract.ts";

export const MAIN_EXECUTABLE = "Contents/MacOS/ghostget-desktop";
export const MAIN_IDENTIFIER = "com.ghostget.desktop";
export const SECURE_ENTRY_BUNDLE = "Contents/Helpers/Ghostget Secure Entry.app";
export const SECURE_ENTRY_EXECUTABLE = `${SECURE_ENTRY_BUNDLE}/Contents/MacOS/ghostget-desktop`;
export const SECURE_ENTRY_IDENTIFIER = "com.ghostget.secure-entry";
export const MAIN_ICON = "Contents/Resources/icon.icns";
export const SECURE_ENTRY_ICON = `${SECURE_ENTRY_BUNDLE}/Contents/Resources/icon.icns`;

export function secureEntryInfo(version: string): string {
  requireValue(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(version), "secure entry version differs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ghostget-desktop</string>
<key>CFBundleIdentifier</key><string>${SECURE_ENTRY_IDENTIFIER}</string>
<key>CFBundleName</key><string>Ghostget Secure Entry</string>
<key>CFBundleDisplayName</key><string>Ghostget Secure Entry</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>14.5</string>
<key>LSUIElement</key><true/>
</dict></plist>
`;
}

function exactPath(app: string, relative: string): string {
  const root = resolve(app), path = join(root, relative);
  requireValue(realpathSync(root) === root && realpathSync(path) === path, "secure entry path is not canonical");
  return path;
}

/** This is a build operation over the fixed generated app, never a runtime install. */
export function stageSecureEntry(app: string, version: string): void {
  const metadata = secureEntryInfo(version), source = exactPath(app, MAIN_EXECUTABLE), info = lstatSync(source);
  const icon = exactPath(app, MAIN_ICON), iconInfo = lstatSync(icon);
  requireValue(info.isFile() && info.nlink === 1 && (info.mode & 0o111) !== 0, "main native executable is unsafe");
  requireValue(iconInfo.isFile() && iconInfo.nlink === 1 && iconInfo.size > 0, "main native icon is unsafe");
  const helpers = join(app, "Contents/Helpers");
  if (!existsSync(helpers)) mkdirSync(helpers, { mode: 0o755 });
  exactPath(app, "Contents/Helpers");
  const helper = join(app, SECURE_ENTRY_BUNDLE);
  if (existsSync(helper)) { exactPath(app, SECURE_ENTRY_BUNDLE); rmSync(helper, { recursive: true }); }
  mkdirSync(join(helper, "Contents/MacOS"), { recursive: true, mode: 0o755 });
  mkdirSync(join(helper, "Contents/Resources"), { mode: 0o755 });
  copyFileSync(source, join(app, SECURE_ENTRY_EXECUTABLE));
  chmodSync(join(app, SECURE_ENTRY_EXECUTABLE), 0o755);
  copyFileSync(icon, join(app, SECURE_ENTRY_ICON));
  chmodSync(join(app, SECURE_ENTRY_ICON), 0o644);
  writeFileSync(join(helper, "Contents/Info.plist"), metadata, { flag: "wx", mode: 0o644 });
  validateSecureEntry(app, version, true);
}

/** Signing changes code signatures, so byte equality is required only before sealing. */
export function validateSecureEntry(app: string, version: string, requireMatchingExecutable: boolean): void {
  const main = exactPath(app, MAIN_EXECUTABLE), helper = exactPath(app, SECURE_ENTRY_EXECUTABLE);
  const info = exactPath(app, `${SECURE_ENTRY_BUNDLE}/Contents/Info.plist`);
  const icon = exactPath(app, SECURE_ENTRY_ICON), mainIcon = exactPath(app, MAIN_ICON);
  for (const path of [main, helper, info, icon, mainIcon]) {
    const value = lstatSync(path);
    requireValue(value.isFile() && value.nlink === 1, "secure entry file is unsafe");
  }
  requireValue((lstatSync(helper).mode & 0o777) === 0o755, "secure entry executable mode differs");
  requireValue(readFileSync(info, "utf8") === secureEntryInfo(version), "secure entry bundle metadata differs");
  requireValue(readFileSync(icon).equals(readFileSync(mainIcon)), "secure entry icon differs from the native app");
  const directories = new Set(["Contents", "Contents/MacOS", "Contents/Resources"]);
  const files = new Set(["Contents/Info.plist", "Contents/MacOS/ghostget-desktop", "Contents/Resources/icon.icns"]);
  if (!requireMatchingExecutable) { directories.add("Contents/_CodeSignature"); files.add("Contents/_CodeSignature/CodeResources"); }
  const walk = (directory: string, relative: string): void => {
    for (const name of readdirSync(directory)) {
      const child = `${relative}${name}`, path = join(directory, name), value = lstatSync(path);
      requireValue(!value.isSymbolicLink() && (directories.has(child) && value.isDirectory() || files.has(child) && value.isFile() && value.nlink === 1), "secure entry bundle layout differs");
      if (value.isDirectory()) walk(path, `${child}/`);
    }
  };
  walk(join(app, SECURE_ENTRY_BUNDLE), "");
  if (requireMatchingExecutable) requireValue(readFileSync(main).equals(readFileSync(helper)), "secure entry executable differs from the compiled native host");
}
