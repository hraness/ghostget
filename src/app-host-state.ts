import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { canonicalJson } from "./canonical-json";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, readPrivateStateFileIfPresent } from "./storage";
import type { ControlEnvironment } from "./control/web-policy";
import { ControlError } from "./control/validation";

/** The app ID partitions storage; it is never proof of caller identity. */
export function appHostEnvironment(appId: string, source: ControlEnvironment = process.env): ControlEnvironment {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,7}$/u.test(appId) || appId.length > 128) {
    throw new ControlError("INVALID_APP_ID", "Supply a bounded reverse-DNS app ID.");
  }
  const home = source.HOME ?? homedir();
  const root = source.GHOSTGET_STATE_HOME ?? join(home, "Library", "Application Support", appId, "ghostget");
  if (!isAbsolute(root) || root.includes("\0") || resolve(root) !== root || root.length > 4096) {
    throw new ControlError("INVALID_STATE_HOME", "Supply an absolute product-owned GhostGet state directory.");
  }
  const globalEnvironment = { ...source, GHOSTGET_STATE_HOME: undefined };
  if (root === ghostgetStateHome(globalEnvironment)) throw new ControlError("INVALID_STATE_HOME", "The app host cannot reuse the global GhostGet state directory.");
  // The provider runtime needs its reviewed cookie/browser settings, but the
  // state namespace and update policy are always owned by this host.
  return { ...source, GHOSTGET_STATE_HOME: root, HRANESS_NO_UPDATE: "1" };
}

/** Refuse another app's realm or an unmarked existing CLI state directory. */
export function admitAppHostState(appId: string, environment: ControlEnvironment): void {
  const root = ghostgetStateHome(environment);
  ensurePrivateStateDirectory(root, environment);
  const path = join(root, "control", "app-host.json");
  const expected = `${canonicalJson({ schemaVersion: 1, appId })}\n`;
  const current = readPrivateStateFileIfPresent(path, 1024, "app-host identity", environment);
  if (current === null) {
    if (readdirSync(root).some(entry => entry !== ".io-state.json")) throw new ControlError("STATE_HOME_NOT_EMPTY", "Choose an empty product-owned GhostGet state directory.");
    ensurePrivateStateDirectory(join(root, "control"), environment);
    createPrivateJsonIfAbsent(path, { schemaVersion: 1, appId }, { environment });
  }
  if (readPrivateStateFileIfPresent(path, 1024, "app-host identity", environment) !== expected) {
    throw new ControlError("STATE_HOME_CONFLICT", "This GhostGet state directory belongs to a different app.");
  }
}
