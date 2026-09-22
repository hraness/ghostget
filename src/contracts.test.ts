import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import * as contracts from "./contracts";

const barrelPath = join(import.meta.dir, "contracts.ts");

/**
 * Forbid filesystem, network, and DNS access outside module loading while the
 * barrel is imported, mirroring the package-root inertness guard in
 * `scripts/package-smoke.ts`.
 */
const inertImportProgram = `
  import fs from "node:fs";
  import fsPromises from "node:fs/promises";
  import http from "node:http";
  import https from "node:https";
  import net from "node:net";
  import dns from "node:dns";
  import { syncBuiltinESMExports } from "node:module";
  const forbidden = (name) => () => { throw new Error("contracts import attempted " + name); };
  const loaderCaller = (stack) => {
    const immediateCaller = (stack ?? "").split("\\n")[2] ?? "";
    return immediateCaller.includes("node:internal/modules/")
      || immediateCaller.includes("(node:fs:")
      || immediateCaller.includes("(node:fs/");
  };
  const loaderOnly = (name, implementation, target) => function (...args) {
    if (!loaderCaller(new Error().stack)) {
      throw new Error("contracts import attempted filesystem access via " + name);
    }
    return Reflect.apply(implementation, target, args);
  };
  for (const name of ["accessSync", "existsSync", "lstatSync", "openSync", "readFileSync", "readdirSync", "realpathSync", "statSync", "mkdirSync", "writeFileSync"]) {
    Object.defineProperty(fs, name, { configurable: true, value: loaderOnly(name, fs[name], fs) });
  }
  for (const name of ["access", "lstat", "open", "readFile", "readdir", "realpath", "stat", "mkdir", "writeFile"]) {
    Object.defineProperty(fsPromises, name, { configurable: true, value: loaderOnly("promises." + name, fsPromises[name], fsPromises) });
  }
  Object.defineProperty(http, "request", { configurable: true, value: forbidden("HTTP access") });
  Object.defineProperty(http, "get", { configurable: true, value: forbidden("HTTP access") });
  Object.defineProperty(https, "request", { configurable: true, value: forbidden("HTTPS access") });
  Object.defineProperty(https, "get", { configurable: true, value: forbidden("HTTPS access") });
  Object.defineProperty(net, "connect", { configurable: true, value: forbidden("network access") });
  Object.defineProperty(net, "createConnection", { configurable: true, value: forbidden("network access") });
  Object.defineProperty(dns, "lookup", { configurable: true, value: forbidden("DNS access") });
  globalThis.fetch = forbidden("fetch access");
  syncBuiltinESMExports();
  const module = await import(${JSON.stringify(barrelPath)});
  process.stdout.write(JSON.stringify(Object.keys(module).sort()));
`;

describe("@hraness/ghostget/contracts", () => {
  test("exports exactly the frozen A5 surface", () => {
    expect(Object.keys(contracts).sort()).toEqual([
      "ContractParseError",
      "checkCollectionPlan",
      "contractRepairSignalsForPlan",
      "contractSchema",
      "createContractRepairHandoff",
      "parseCollectionPlan",
      "parseContractCatalog",
      "parseContractCheck",
      "parseContractRepairHandoff",
      "parseContractRepairSignal",
      "parseInvokeReadResult",
      "readFailureDispositions",
    ]);
    expect(Object.isFrozen(contracts.readFailureDispositions)).toBeTrue();
    expect(contracts.readFailureDispositions).toEqual({
      "target-unavailable": "do-not-retry",
      "auth-repair-required": "repair-auth",
      "account-mismatch": "do-not-retry",
      "contract-drift": "do-not-retry",
      "cleanup-required": "do-not-retry",
      "provider-throttled": "retry-once-after-60s",
      "provider-temporary": "retry-once-after-60s",
      "operation-timeout": "retry-once-after-60s",
    });
  });

  test("importing the barrel touches no local state, provider runtime, or network", () => {
    const result = spawnSync(process.execPath, ["--no-env-file", "-e", inertImportProgram], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent-ghostget-home", GHOSTGET_STATE_HOME: "/nonexistent-ghostget-state" },
      timeout: 60_000,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(Object.keys(contracts).sort());
  });

  test("never imports storage, auth, providers, or the registry", () => {
    const seen = new Set<string>();
    const queue = ["contracts.ts"];
    const forbidden = /^\.\/(?:storage|auth|auth-storage|provider-plugins|provider-plugin-registry|provider-plugin-store|providers\/|runtime|client|ghostget|catalog-cli|contracts-cli)(?:\.ts)?$/u;
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);
      const source = require("node:fs").readFileSync(join(import.meta.dir, file), "utf8") as string;
      for (const match of source.matchAll(/^(?:import|export)(?!\s+type)[^"']*["'](\.\/[^"']+)["']/gmu)) {
        const specifier = match[1] ?? "";
        expect(specifier).not.toMatch(forbidden);
        queue.push(`${specifier.slice(2)}.ts`);
      }
    }
    expect([...seen].sort()).toEqual([
      "canonical-json.ts",
      "contracts-catalog.ts",
      "contracts-check.ts",
      "contracts-invoke-read.ts",
      "contracts-plan.ts",
      "contracts-repair.ts",
      "contracts-schema.ts",
      "contracts-shape.ts",
      "contracts-vocabulary.ts",
      "contracts.ts",
      "model.ts",
      "platform-catalog.ts",
      "provider-plugin-identifiers.ts",
      "transport-policy.ts",
      "web-session-template.ts",
    ]);
  });
});
