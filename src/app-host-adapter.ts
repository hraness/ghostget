import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { manifestHash, parseDiagnosticManifest, parseRuntimeManifest } from "./model";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import { installBundledAdapterGeneration, loadInstalledDiagnosticManifestSnapshot } from "./storage";
import { ControlError } from "./control/validation";
import type { ControlEnvironment } from "./control/web-policy";

const assets = join(import.meta.dir, "assets", "adapters", "x");

function source(name: string): { bytes: Buffer; value: unknown } {
  const path = join(assets, name);
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > 1024 * 1024) throw new Error("Invalid bundled X interface source");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    if (["dev", "ino", "mode", "size", "mtimeNs", "ctimeNs"].some(key => before[key as keyof typeof before] !== after[key as keyof typeof after])
      || bytes.length !== Number(before.size)) throw new Error("Bundled X interface changed during its snapshot");
    return { bytes, value: JSON.parse(bytes.toString("utf8")) as unknown };
  } finally { closeSync(fd); }
}

/**
 * Called once under the app-host's control-owner lock, before accepting work.
 * Only an exact archived distribution is upgraded. Custom, newer, malformed
 * and portable-plugin installs remain owner-controlled. The existing atomic
 * generation API conditionally replaces the observed adapter alone: accounts,
 * pending plans, journals, receipts and recovery assets are never rewritten.
 * Old plans keep their original hash and the runtime refuses a stale commit;
 * their account-bound status and cancellation paths remain available.
 */
export function upgradeAppHostXAdapter(environment: ControlEnvironment, registry: ProviderPluginRegistry): "absent" | "current" | "upgraded" | "preserved" {
  if (registry.resolveOwnedManifest("x-web") !== undefined) return "preserved";
  const installed = loadInstalledDiagnosticManifestSnapshot("x-web", environment, registry);
  if (installed.availability === "absent") return "absent";
  if (installed.availability === "unsafe") throw new ControlError("ADAPTER_UNAVAILABLE", "The saved X interface cannot be inspected safely. Review it before reopening this app.");
  if (!installed.result.ok || installed.contentSha256 === null) return "preserved";

  const current = source("wrench-web-adapter.json");
  const parsed = parseRuntimeManifest(current.value, registry);
  if (!parsed.ok || parsed.value.id !== "x-web") throw new ControlError("ADAPTER_UNAVAILABLE", "The bundled X interface is unavailable or invalid.");
  const installedHash = manifestHash(installed.result.value);
  if (installedHash === manifestHash(parsed.value)) return "current";
  const files = readdirSync(assets).filter(name => /^wrench-web-adapter\.v\d+\.\d+\.\d+\.json$/u.test(name)).sort();
  if (files.length > 100) throw new Error("Bundled X interface history exceeded its bound");
  const reviewed = files.some(name => {
    const baseline = parseDiagnosticManifest(source(name).value, registry);
    if (!baseline.ok || baseline.value.id !== "x-web") throw new Error("Invalid archived X interface source");
    return manifestHash(baseline.value) === installedHash;
  });
  if (!reviewed) return "preserved";
  installBundledAdapterGeneration([{
    id: "x-web", state: "present", manifest: parsed.value,
    sourceContentSha256: createHash("sha256").update(current.bytes).digest("hex"),
    expectedCurrentContentSha256: installed.contentSha256,
  }], environment, { registry });
  return "upgraded";
}
