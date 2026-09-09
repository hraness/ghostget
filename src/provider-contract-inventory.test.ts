import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

const predecessorDefaultInventorySha256 =
  "87d71f678c9e87a5fd2a1813f17e7983650a5c7277cf38aecf9ce358b9a093c5";
const predecessorLegacyInventorySha256 = [
  "c073950ef5e1243ecaa166aa14e8ad3b160b35215f0b656b882632ac5ea0738f",
  "3ad65db9c3259f585683176f5546d9b40868869cfba21f4ff83c4e16a70c8b74",
  "3c752d05bcdf70057a006f208120a65ac62438a56458fe6c310f9b7bae0fac5f",
  "b11ef5c475330919e148fe8a2b96505792761fab93cf49b0988bf9becfa1a6fa",
  "98fff0fe0955d2c655fa9077c205dbaabd90a0abfaa237f05d05d328ab31bf36",
  "acecd9855f8c0dd17b132faa6fbe8de474b679b5a3fad8ed50dbed5e219477f2",
  "3b375a4bdfc5d65759604a81c393f259d53358128d0aac674ca0f7b5cbdb3f4a",
  "92fb87dd6a984dacfaf8c8712f62aa1f26c05031fbbd15f6202eb2c170832006",
  "60df1d002384d31afc237a8d80f77a0723e297ba4deafa33ff15cf2e4d2a6848",
  "25e3e4cc2b0837bf57deaf2332c8643353900389340def4a7aba6757802ab25a",
  "8c877e5896d58f6467f4cf57178e3e8847b4fc387ba75fa71cf8e79892a0ba3e",
  "ccbc0a5cc9b220cdd342b07869c5c0fd7bbd2615b736551b0998a8eec5ac89d0",
  "9e090687c8ac25bc67b7aaeb2509c69cf07ce14836dfa72466279050aeb4baf6",
  "c27e6e3d611b4b6b29f06eccbd0bbd5e3b1282370021cbbb7e81dd129d761017",
  "ec8555103b2824528702f6e199def0524b62ce4e41a2c9cae92d2fa9822a0a54",
  "f1f6452859da9c0ef4da8d7e043c576337391ab298c9a87a5cd08453fadb0b54",
  "4b5cfe5ed97c2d6600be2300efe11bf6a4673a6559bd2600432eff8d9a8304b6",
  "7f642d29184480fbe803e36947621170d3f9f1526e40f64d3a3980c450c797d9",
  "3509bc4db45c29c1d6d4d146cb82964c634dc982ed7331c5c37c91b98462e68d",
];

const moduleUrl = (name: string) => pathToFileURL(
  join(import.meta.dir, name),
).href;

const inventoryProgram = `
import { createHash } from "node:crypto";
const [{ createProviderPluginRegistry }, { generatedProviderPlugins }, providerContracts, webContracts, localContracts] = await Promise.all([
  import(${JSON.stringify(moduleUrl("provider-plugin-registry.ts"))}),
  import(${JSON.stringify(moduleUrl("provider-plugins.generated.ts"))}),
  import(${JSON.stringify(moduleUrl("provider-contracts.ts"))}),
  import(${JSON.stringify(moduleUrl("web-session-contracts.ts"))}),
  import(${JSON.stringify(moduleUrl("local-cli-contracts.ts"))}),
]);
const registry = createProviderPluginRegistry(generatedProviderPlugins);
const rows = [];
const currentOnlyRows = [];
const legacyRows = [];
const predecessorRedditWriter = "646a29b320373f50ccdf9ae8b8b60d5147428f0f899a226480c2c5b009294d8a";
const predecessorRedditReaders = [
  "64a4c1e78ce8565a50613f63ff605f0f57f488617ef31386b5ddce5e3db885c9",
  "058987e5eac61505ca53f80d8494fb5505e697e0313e6e197a198649be7c3a3c",
  "05173089ec6d555845fa5fb7b08a70bd0bf810a18882c9ecdd784a437db791c5",
  "dea85e9a5bc2a134ce48769655c2e4df89d68a876012b4af3e08f40526d02512",
  "64a4c1e78ce8565a50613f63ff605f0f57f488617ef31386b5ddce5e3db885c9",
  "058987e5eac61505ca53f80d8494fb5505e697e0313e6e197a198649be7c3a3c",
  "05173089ec6d555845fa5fb7b08a70bd0bf810a18882c9ecdd784a437db791c5",
  "16e4e48609c12d5ffdaf47e622764e06cc9b3381c6b8ceb2c9f773fa9d99bdd9",
  "91cc3364ab1ccba66bd2e099f64fcccc187fde94145a8bf1eaa14f0f5533f6d7",
];
let acceptedLegacy = true;
let rejectedUnknown = true;
function stableJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  const record = value;
  return "{" + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
}
function predecessorWebContract(contract) {
  if (contract.site !== "facebook-marketplace"
    || contract.operation !== "feeds.read"
    || (contract.contractVersion !== 1 && contract.contractVersion !== 2)) return contract;
  const project = (value) => {
    if (value === "wrench-issued authenticated cursor returned by a complete prior Marketplace page; one chain supports at most 48 provider pages") {
      return "oh-issued authenticated cursor returned by a complete prior Marketplace page; one chain supports at most 48 provider pages";
    }
    if (Array.isArray(value)) return value.map(project);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, project(entry)]));
  };
  return project(contract);
}
function legacyHash(contract, implementationHash, web) {
  return createHash("sha256")
    .update(stableJson(web ? predecessorWebContract(contract) : contract))
    .update("\\0")
    .update(implementationHash)
    .digest("hex");
}
function isCurrentOnlyRow(row) {
  return (row[0] === "provider-api" && row[1] === "gmail")
    || (row[0] === "local-cli" && row[1] === "beeper")
    || (row[0] === "local-cli" && row[1] === "imessage")
    || (row[0] === "web-session-api" && row[1] === "clasificados")
    || (row[0] === "web-session-api" && row[1] === "github")
    || (row[0] === "web-session-api" && row[1] === "reddit" && row[2].startsWith("flair."))
    || (row[0] === "web-session-api" && row[1] === "twitch");
}
function appendCurrentRow(row) {
  if (isCurrentOnlyRow(row)) {
    // Routes introduced after the predecessor inventory keep their own
    // reader aliases without rewriting that historical baseline.
    currentOnlyRows.push(row);
    return false;
  }
  rows.push(row);
  return true;
}
for (const plugin of registry.list()) {
  for (const binding of plugin.bindings) {
    for (const operation of binding.operations) {
        for (const contractVersion of operation.contractVersions) {
          const registeredLegacyImplementations = registry.legacyContractImplementationHashes(
            binding,
            operation.name,
            contractVersion,
          );
          const isPredecessorReddit = binding.surfaceId === "reddit" && !operation.name.startsWith("flair.");
          const legacyImplementations = isPredecessorReddit
            ? predecessorRedditReaders.map((hash) => Buffer.from(hash, "hex"))
            : registeredLegacyImplementations;
          if (binding.transport === "provider-api") {
          const contract = providerContracts.getProviderContract({
            provider: binding.surfaceId,
            action: operation.name,
            contractVersion,
            timeoutMs: 30_000,
            maxOutputBytes: 1024 * 1024,
          }, registry);
          const includePredecessorInventory = appendCurrentRow([binding.transport, binding.surfaceId, operation.name, contractVersion,
            providerContracts.providerContractHash(contract, registry)]);
          if (includePredecessorInventory) {
            legacyImplementations.forEach((implementationHash, index) => {
              const hash = legacyHash(contract, implementationHash, false);
              legacyRows[index] ??= [];
              legacyRows[index].push([binding.transport, binding.surfaceId, operation.name, contractVersion, hash]);
              acceptedLegacy &&= providerContracts.isCompatibleProviderContractHash(contract, hash, registry);
            });
          }
          rejectedUnknown &&= !providerContracts.isCompatibleProviderContractHash(
            contract, "f".repeat(64), registry,
          );
        } else if (binding.transport === "local-cli") {
          const contract = localContracts.getLocalCliContract({
            surface: binding.surfaceId,
            action: operation.name,
            contractVersion,
            timeoutMs: 60_000,
            maxOutputBytes: 2 * 1024 * 1024,
          }, registry);
          const includePredecessorInventory = appendCurrentRow([
            binding.transport,
            binding.surfaceId,
            operation.name,
            contractVersion,
            localContracts.localCliContractHash(contract, registry),
            contract.tool,
          ]);
          if (includePredecessorInventory) {
            throw new Error("local CLI route unexpectedly entered predecessor inventory");
          }
          rejectedUnknown &&= !localContracts.isCompatibleLocalCliContractHash(
            contract, "f".repeat(64), registry,
          );
        } else {
          const contract = webContracts.getWebSessionContract({
            site: binding.surfaceId,
            action: operation.name,
            contractVersion,
            timeoutMs: 60_000,
            maxOutputBytes: 2 * 1024 * 1024,
          }, registry);
          const currentHash = isPredecessorReddit
            ? legacyHash(contract, Buffer.from(predecessorRedditWriter, "hex"), true)
            : webContracts.webSessionContractHash(contract, registry);
          acceptedLegacy &&= webContracts.isCompatibleWebSessionContractHash(contract, currentHash, registry);
          const includePredecessorInventory = appendCurrentRow([binding.transport, binding.surfaceId, operation.name, contractVersion,
            currentHash]);
          if (includePredecessorInventory) {
            legacyImplementations.forEach((implementationHash, index) => {
              const hash = legacyHash(contract, implementationHash, true);
              legacyRows[index] ??= [];
              legacyRows[index].push([binding.transport, binding.surfaceId, operation.name, contractVersion, hash]);
              acceptedLegacy &&= webContracts.isCompatibleWebSessionContractHash(contract, hash, registry);
            });
          }
          rejectedUnknown &&= !webContracts.isCompatibleWebSessionContractHash(
            contract, "f".repeat(64), registry,
          );
        }
      }
    }
  }
}
const predecessorRouteOrder = [
  ["linked-device", "beeper"],
  ["linked-device", "whatsapp"],
  ["provider-api", "linkedin"],
  ["provider-api", "x"],
  ["web-session-api", "bluesky"],
  ["web-session-api", "facebook-group"],
  ["web-session-api", "facebook-marketplace"],
  ["web-session-api", "facebook-page"],
  ["web-session-api", "facebook"],
  ["web-session-api", "hacker-news"],
  ["web-session-api", "instagram"],
  ["web-session-api", "linkedin"],
  ["web-session-api", "reddit"],
  ["web-session-api", "substack"],
  ["web-session-api", "threads"],
  ["web-session-api", "tiktok"],
  ["web-session-api", "x"],
  ["web-session-api", "youtube"],
].map(([transport, surfaceId]) => transport + "\\0" + surfaceId);
const routeRank = new Map(predecessorRouteOrder.map((route, index) => [route, index]));
rows.sort((left, right) => {
  const leftRank = routeRank.get(left[0] + "\\0" + left[1]);
  const rightRank = routeRank.get(right[0] + "\\0" + right[1]);
  if (leftRank === undefined || rightRank === undefined) {
    throw new Error("provider contract inventory contains an unreviewed route");
  }
  return leftRank - rightRank;
});
for (const legacy of legacyRows) {
  legacy.sort((left, right) => {
    const leftRank = routeRank.get(left[0] + "\\0" + left[1]);
    const rightRank = routeRank.get(right[0] + "\\0" + right[1]);
    if (leftRank === undefined || rightRank === undefined) {
      throw new Error("provider contract legacy inventory contains an unreviewed route");
    }
    return leftRank - rightRank;
  });
}
currentOnlyRows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
process.stdout.write(JSON.stringify({
  rows: rows.length,
  sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  currentOnlyRows: currentOnlyRows.length,
  currentOnlySha256:
    createHash("sha256").update(JSON.stringify(currentOnlyRows)).digest("hex"),
  legacyRows: legacyRows.map((legacy) => legacy.length),
  legacySha256: legacyRows.map((legacy) =>
    createHash("sha256").update(JSON.stringify(legacy)).digest("hex")
  ),
  acceptedLegacy,
  rejectedUnknown,
}));
`;

async function inventoryForNodeEnv(nodeEnv: string | undefined): Promise<unknown> {
  const environment = { ...process.env };
  if (nodeEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = nodeEnv;
  const result = Bun.spawn({
    cmd: [process.execPath, "-e", inventoryProgram],
    cwd: join(import.meta.dir, ".."),
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `contract inventory child failed for NODE_ENV=${nodeEnv ?? "<unset>"}: ${stderr}`,
    );
  }
  return JSON.parse(stdout);
}

describe("durable provider contract inventory", () => {
  test("preserves every predecessor writer identity across execution modes", async () => {
    const inventories = await Promise.all([
      undefined,
      "test",
      "production",
      "development",
      "staging",
    ].map((nodeEnv) => inventoryForNodeEnv(nodeEnv)));
    for (const inventory of inventories) {
      expect(inventory).toEqual({
        rows: 324,
        sha256: predecessorDefaultInventorySha256,
        currentOnlyRows: 58,
        currentOnlySha256: "3afd55dd919e3cd938fbf9ad414035a0815dc2c53039201c11b7025d4e103be5",
        legacyRows: [
          324,
          324,
          324,
          324,
          324,
          324,
          324,
          292,
          292,
          254,
          228,
          187,
          166,
          146,
          146,
          146,
          146,
          25,
          25,
        ],
        legacySha256: predecessorLegacyInventorySha256,
        acceptedLegacy: true,
        rejectedUnknown: true,
      });
    }
  });
});
