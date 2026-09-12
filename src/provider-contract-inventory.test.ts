import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

const predecessorDefaultInventorySha256 =
  "0c05340e428114a1edf1e14407a72088ba61e4ff43cdd7e07dde5ba0f8588d11";
const predecessorLegacyInventorySha256 = [
  "f9703703d5216e03a9f73b70c17f3a54e403e5f8d662a0f26aad09ef0543f6b1",
  "b0a70d84621ac626a67ef1be195bb8cbe4a995675335fd2e6c44fe243c34b173",
  "2bac4f4164c8b5e941ac490dc677f064a49a086dc806c9d189b47786831edc38",
  "d28264f9976007f06e30a7781038b534d28165ccb2edb319fba315709790e627",
  "2eb2cceb8dcda28c8095a9c61922e82e653568535c818e297af9f9abadf83f02",
  "63e38e6de487d25d5f65d27c54b81fddf8a37bce04b029390ffb46ca8da500f2",
  "5017d785d5ed3d7f3c2ad579229405e2612264aa9ef2fbb80746bc12dc1991e5",
  "61cc96700495479a6ea3da839375b6f86ca8890ad3294fa4e5263f26f2468565",
  "3cbefb26f4161f8bb11628a356ffe91e697362d05450233d69f6859b62e141b2",
  "52ae0bc1c1bb9f0960ca8766575ac267795e7de8dee65aed903573eb131648a5",
  "80b627c394a44b4a3e1a6721c58f073fa3da41ae316e0a9471d1c7cd2fd23338",
  "eb205ba72c1656cfeac2e76e732b4f9b675446938bbbaacffe486856c71076f3",
  "59ee1cf46143322042099a74fb17f038f02eea1ea44faef15760d090bf1b7c30",
  "803c727cf7298c0adaffd11a796253add12f07f0a09bb17a1e3ee943c9650936",
  "6c48662c5603911e322de5a3a5f1f38b0d214e3df2b94c6a31594e44507420be",
  "9710f75e36eb31f46f2c6e707d4d24b626c9fa0dff65fea8e982fee78efa3504",
  "9d8063889763001899936c987b5233b2c7b6d5f56a32621b3122ebe7a59e0278",
  "89f92e12a095daedb5a65cdd5b0be19e13127df3a8e7daaaa1d7a9129453c2ad",
  "0ed7cdc0977abc94c299f80eebda5222967e68820399405731e5b7379c0206ab",
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
