/**
 * Project the bundled adapter assets into a contract catalog without any
 * installed state, for tests that pin the tree's current contracts. Never
 * shipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { listRuntimeManifests } from "./catalog-cli";
import type { ContractCatalogV1 } from "./contracts-catalog";
import { projectContractCatalog } from "./contracts-cli";
import { parseRuntimeManifest } from "./model";
import { providerPluginRegistry } from "./provider-plugins";

export const BUNDLED_CATALOG_TIME = new Date("2026-09-21T20:00:00.000Z");

/** Every current bundled manifest (`wrench-adapter.json` and `wrench-web-adapter.json`). */
export function bundledContractCatalog(): ContractCatalogV1 {
  const assets = join(import.meta.dir, "assets", "adapters");
  const manifests = readdirSync(assets, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => ["wrench-adapter.json", "wrench-web-adapter.json"].flatMap((filename) => {
      let text: string;
      try {
        text = readFileSync(join(assets, entry.name, filename), "utf8");
      } catch {
        return [];
      }
      const parsed = parseRuntimeManifest(JSON.parse(text) as unknown, providerPluginRegistry);
      if (!parsed.ok) throw new Error(`bundled ${entry.name}/${filename}: ${parsed.issues.join("; ")}`);
      return [{ id: parsed.value.id, result: parsed }];
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return projectContractCatalog(
    manifests as ReturnType<typeof listRuntimeManifests>,
    providerPluginRegistry,
    { now: BUNDLED_CATALOG_TIME },
  );
}
