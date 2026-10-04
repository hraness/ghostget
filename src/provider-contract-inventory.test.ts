import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

const predecessorDefaultInventorySha256 =
  "d6539497472d2d7f6c0ddb36f8c8709c6ac888c0d3e29da81d7f282d414f5692";
const predecessorLegacyInventorySha256 = [
  "147bf2b55528b929c9ae5eac3c05c07d0ac62064d76b5e55ec3a4d2701e4cd5e",
  "f9a8a10c4f65fa9f5c9f67e331f200c75038dd9f77be2ba855ab97c2a1063df7",
  "3525acffd2dad94b5148c3b388aa2802bf285ebbdb30b535ace61fdfe4d73787",
  "7c81dcc4311c85e4711fdcc7823d2c3dfc1e1fd587c980ac14416208790538bf",
  "997fb00e2a04cc4c074e5daa6cf13885253c2f5ee13019e1f35342ae8f1929f3",
  "6a0626e2a328bae41d20049a049fc4dd65bf2e651ddef1c8b4c6f22bbd4cc1f2",
  "92bad323398e551244f5df4016b5ff9827958cb9a6ba91dbca9e20d962aab40a",
  "d186bf8efc1d1bec541dc1ac86a4fabd6dc60dfdbaab45cb511ba514c494b96c",
  "c4517f45bbde70f43c54748a88fa3622800a62c9da69d18524d8398c06cf1639",
  "4af16ed6a95faaa50ae356e969a9d3d33eb01f0600f12e9055a188784b5a2dba",
  "1b761fbec7c29383071ddde4201b7f96b29a4afc77de4d8fc8beff62aff3ad9e",
  "2113e8c8183519f89a131ffa07c06e6f3c614788537e350a0d9fff1093c423d1",
  "1bcab0bb7fb40aaa0b66635a01eb9f661b4fb5b06c4a8f08a1568c9a176c80ca",
  "89b8e7d0019d1d08bb3cb754a64d2aeed38f063d53fe582163dab0e061d5dda3",
  "3772f3ebe8c8f98044f28fda6cf5674fb095a5c4927c99d1d99d73f0faebe7c3",
  "67ab1b33bb2ccfa73d4278aa44b65b0f7de5a830865e3c1708bf5497196dad92",
  "4e5585d98c282a7d1b9c12e2f1ee07bb21453b4ee42f865a8a3feb67d0712a9e",
  "934d2a3a386716ce1bc1a23f32c5e28e0121c9052be37413282ff5ed66959b46",
  "d3d7e9d7bfab55d5065848dad77b6f8a8b3f89a7c0e9307d847ed6bd35a3386d",
  "ea44b331fd032b3ce00d78f1567c94c112d5ea159ad2905e96595d5149235c34",
  "70b98b1f795a88425f4e2b782a167413df4fdf844036d1ecc968575d5e4e76a8",
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
const predecessorHackerNewsWriter = "66b9744caeb514cd9c4a749db4baaca84346098b162cdf4bcba653b7e9d9408a";
const predecessorHackerNewsReaders = [
  "e4c9e459c0185428d759994a160200b5d883119caca828b6ae7469124ef82f14",
  "c54f71de41c0df51a36f8a1c80b092b4534ffbd16aedacfba599d68e8f6b4130",
  "ff716adff5a4f962a765020474325037d0d4795c61f086c13e5d2adc61484ec8",
  "da3cdd6465b92ce933004fb9e3f2bf3dd48811e766079647d2cdaec43e507e1d",
  "e4c9e459c0185428d759994a160200b5d883119caca828b6ae7469124ef82f14",
  "c54f71de41c0df51a36f8a1c80b092b4534ffbd16aedacfba599d68e8f6b4130",
  "ff716adff5a4f962a765020474325037d0d4795c61f086c13e5d2adc61484ec8",
];
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
const predecessorSubstackWriter = "58438f60cf9b2d2db9363cb7dece0c6ca56e60c2178fe4bcbd60c844fc8893ba";
const predecessorSubstackReaders = [
  "99fc0287f9445b0e4d692e39201ebb8b9e9bb86308c9619c20e3bff83655243d",
  "fb58ac6ba745b2dc4dc176e8e3b7f4d3362cd8026d3e00557f72342b76b7c519",
  "58c2b588db7154883a154d05194cde62ff19b8e14045d10f854aacc9a4433e73",
  "4fbfe4ae9638728c1ce48c15e0c8b2343a39c372ab01d8b5f6a75665af0df040",
  "99fc0287f9445b0e4d692e39201ebb8b9e9bb86308c9619c20e3bff83655243d",
  "fb58ac6ba745b2dc4dc176e8e3b7f4d3362cd8026d3e00557f72342b76b7c519",
  "58c2b588db7154883a154d05194cde62ff19b8e14045d10f854aacc9a4433e73",
  "3dfe5b506cef46b6534c7abd195a98df0a825a321bd0690eddae674e4592c041",
  "d35dda6043e224f4a2d6305a4a6aac9f05bef37ecfbfd087973394cdbe0c6811",
  "2062f7c39c75ce286f26e7bd513871e5cbc2b62e2408d20df28af906f8ad5012",
  "e4ba73882eb3f5bf489c88861cdd1fedd790a55af027e03ff5a07b526b8f0f5f",
  "96a992faae17420dc2ec74c9d22903bb7973f69d3f0de198800d357480651269",
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
const predecessorHackerNewsWriteOperations = new Set([
  "comments.create",
  "content.save",
  "posts.publish",
  "reactions.set",
  "replies.create",
]);
function predecessorWebContract(contract) {
  if (contract.site === "hacker-news"
    && contract.contractVersion === 1
    && predecessorHackerNewsWriteOperations.has(contract.operation)) {
    const url = contract.input?.properties?.url;
    const input = contract.operation === "posts.publish" && url !== undefined
      ? { ...contract.input, properties: { ...contract.input.properties, url: { ...url, format: "url" } } }
      : contract.input;
    return { ...contract, state: "capture-required", implementation: "hacker-news " + contract.operation + " requires a fresh reviewed authenticated first-party contract before execution", input };
  }
  if (contract.site === "x"
    && contract.contractVersion === 1
    && contract.operation === "replies.create") {
    return { ...contract, state: "capture-required", implementation: "CreateTweet reply needs an authorized live fixture and reviewed transaction-header behavior" };
  }
  if (contract.site === "bluesky"
    && contract.contractVersion === 1
    && contract.operation === "replies.create") {
    return { ...contract, state: "capture-required", implementation: "bluesky replies.create requires a fresh reviewed authenticated first-party contract before execution" };
  }
  if (contract.site === "bluesky"
    && contract.contractVersion === 1
    && contract.operation === "feeds.read") {
    const feed = contract.input?.properties?.feed;
    const properties = { ...contract.input.properties };
    if (feed !== undefined) properties.feed = { ...feed, enum: ["home", "notifications", "bookmarks"] };
    delete properties.query;
    delete properties.sort;
    return { ...contract, input: { ...contract.input, properties } };
  }
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
    || (row[0] === "provider-api" && row[1] === "microsoft-graph")
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
    || (row[0] === "web-session-api" && row[1] === "substack" && row[2].startsWith("subscribers."))
    || (row[0] === "web-session-api" && row[1] === "twitch")
    || (row[0] === "web-session-api" && row[1] === "webmcp")
    || (row[0] === "web-session-api" && row[1] === "x" && row[2] === "contacts.list");
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
          const isPredecessorSubstack = binding.surfaceId === "substack" && !operation.name.startsWith("subscribers.");
          const isPredecessorHackerNews = binding.surfaceId === "hacker-news";
          const legacyImplementations = isPredecessorReddit
            ? predecessorRedditReaders.map((hash) => Buffer.from(hash, "hex"))
            : isPredecessorSubstack
              ? predecessorSubstackReaders.map((hash) => Buffer.from(hash, "hex"))
              : isPredecessorHackerNews
                ? predecessorHackerNewsReaders.map((hash) => Buffer.from(hash, "hex"))
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
            : isPredecessorSubstack
              ? legacyHash(contract, Buffer.from(predecessorSubstackWriter, "hex"), true)
              : isPredecessorHackerNews
                ? legacyHash(contract, Buffer.from(predecessorHackerNewsWriter, "hex"), true)
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
        rows: 325,
        sha256: predecessorDefaultInventorySha256,
        currentOnlyRows: 87,
        currentOnlySha256: "a8ff6d99b948861084dc3a88ee4ad7d5f157d5f6bed10dc5a56c2a6f60bab8d1",
        automationRows: [
          ["linked-device", "whatsapp", "messaging.automation.read", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.attachment", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.link", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.poll", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.reaction", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.sticker", 1],
          ["linked-device", "whatsapp", "messaging.automation.send.text", 1],
          ["linked-device", "whatsapp", "messaging.automation.sync", 1],
          ["local-cli", "beeper", "messaging.automation.read", 1],
          ["local-cli", "beeper", "messaging.automation.send.text", 1],
          ["local-cli", "imessage", "messaging.automation.read", 1],
          ["local-cli", "imessage", "messaging.automation.send.attachment", 1],
          ["local-cli", "imessage", "messaging.automation.send.link", 1],
          ["local-cli", "imessage", "messaging.automation.send.poll", 1],
          ["local-cli", "imessage", "messaging.automation.send.reaction", 1],
          ["local-cli", "imessage", "messaging.automation.send.sticker", 1],
          ["local-cli", "imessage", "messaging.automation.send.text", 1],
        ],
        legacyRows: [
          325,
          325,
          325,
          325,
          325,
          325,
          325,
          293,
          293,
          255,
          255,
          239,
          214,
          168,
          147,
          147,
          147,
          26,
          26,
          26,
          26,
        ],
        legacySha256: predecessorLegacyInventorySha256,
        acceptedLegacy: true,
        rejectedUnknown: true,
      });
    }
  });
});
