import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

const predecessorDefaultInventorySha256 =
  "dccc2b71b68e059cf5c3c5bb5e3ef8ae3db3b7c31eae0c048a1e179a44e28fff";
const predecessorLegacyInventorySha256 = [
  "a49c07a037a51b1a015c932a714f41f05670b5b7b19f053eee4b65852f791de5",
  "5a37af1f4785171d62eda77a058ee0f9a9ef84f5701bef8bf30224226ca7770a",
  "ed6df3eaebecd0f533b78b2b6fdcf40e7446f0297a6ba7f0a910e213967cdd3b",
  "41e5d59fc95bfa42a5d46d9b0ebb00d4776d277d8a596289eec80338481ba342",
  "0673d0c7bc25ae29069d3ce85e8d1319593bf406d05709cd6fb924a4d1ac6f52",
  "624930f8d0a94967e7e1ab68bb4867f8337c72d9debc7adb87957a8090fb1b01",
  "ec8e1951cbcad14ccb9141cc95658e9d61b1d06eaf6238509a1e8bcc76c90e9f",
  "dfa1977a78062004a445abb2beefe89a8e7bda2b25b6a21841bb600b8f16a67b",
  "151380e9a8cee3cfebab31e82365f3c3855f0d83d460adc1bdfa33af8bd587e5",
  "4d9c015599881210a794529ee73afbc4f10e90b31a010157784f5a6c1ce4bd3e",
  "46544b7f9d5ad80352cb275de030d6ddb388900635abacfbcf767f9c4f6b73b1",
  "582d405a1dcc0a4e1ccb384dddd42e0cfece87d074765377ab183ee83ce60193",
  "d279b8620f5245c6fec7253c812f5f2312523ab32ad70585c5769a80bb6c0ff6",
  "272d5b9ad1a63a7097d55bcbb6cee9c05327b6a47f03c4d8b46d1d2e2865520a",
  "d935f0c0667bf2089af75250f792c13e86e0ee9bd848b3aaa2d1fab425a51137",
  "11c4fe38070c758849c62fd8244bc8ad4a8e72cd8a0b91cfb9aba5c477bc7abf",
  "38abc2e95fc9874dd91a943432bdf1a089a0ac0576db122140422b4d4ef417c2",
  "71df28b906eb424e5e2b81eac5d9960c3112953b8c86ae172c7f94675de5376c",
  "e651ddc41554caf97dc1675c8b940a920f2d793bcb354e6b32b4f3c6139ae59a",
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
    || (row[0] === "linked-device" && row[1] === "whatsapp" && row[3] === 1 && [
      "messaging.automation.read",
      "messaging.automation.sync",
      "messaging.automation.send.text",
      "messaging.automation.send.attachment",
      "messaging.automation.send.reaction",
      "messaging.automation.send.sticker",
      "messaging.automation.send.link",
      "messaging.automation.send.poll",
    ].includes(row[2]))
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
  automationRows: currentOnlyRows.filter(row => row[2].startsWith("messaging.automation.")).map(row => row.slice(0, 4)),
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
        currentOnlyRows: 73,
        currentOnlySha256: "58d51f43cc0131710a08e5b81da92eb1cbe05b6f4edd6abde87bc9e7d8afb25f",
        automationRows: [
          ["linked-device", "whatsapp", "messaging.automation.read", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.attachment", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.link", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.poll", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.reaction", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.sticker", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.text", 1],
          ["linked-device", "whatsapp", "messaging.automation.sync", 1],
          ["local-cli", "imessage", "messaging.automation.read", 1],
          ["local-cli", "imessage", "messaging.automation.send.attachment", 1],
          ["local-cli", "imessage", "messaging.automation.send.link", 1],
          ["local-cli", "imessage", "messaging.automation.send.poll", 1],
          ["local-cli", "imessage", "messaging.automation.send.reaction", 1],
          ["local-cli", "imessage", "messaging.automation.send.sticker", 1],
          ["local-cli", "imessage", "messaging.automation.send.text", 1],
        ],
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
