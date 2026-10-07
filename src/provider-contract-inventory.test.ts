import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "bun:test";

const predecessorDefaultInventorySha256 =
  "250f23bb4ddbb36712a8a6c63e577b67ee70873d8c4d857425b3e1ab6d1a6ab0";
const predecessorLegacyInventorySha256 = [
  "dae91740ee05d34b1911b58ed72da21124386e081c9535f90deaeb9202e7cf15",
  "beaa0b64b0cafc4b731d17b58127545916142a7f4f2f99a1ee03b6b0d42a7de2",
  "d9987c035f0af84b7710219d9b1fd0a3dbf1a1d825be501bb4f6df05e8147ef1",
  "6eef4aad8c3f968323a0c350f5d47e6f828d0a258854de4a5f58ebc1f89d1d96",
  "42a9305b3c39fba9db3173194e77d9784fb31cbe84711c69e449bfc3710ab28f",
  "9aa1613307bd83142ebd44a67662fa710322d0e16e28e7123a0ef1f0b0c65abc",
  "f9bdcbfb6c91b41dcf854084eaf4df735539a6336ad4493694f3497a90e28f0d",
  "50486a32717db744ad431c4c4f12e6c85fb58bee98dfac00a861a6427aca9c51",
  "24d36e66e7ed5e789c5c241387a111a64898947b992648422718282d5bbbd970",
  "629d4eff2221796c0910559a3c518b35075d2cd274923895e1292c6491ed40f5",
  "54b7a91a1cbf09403ccc761771722b2098128dcef5d65f80dd961f8330679ad5",
  "270b5c7402ea3f3ec2ea722242da471c7434606c57dbf55f3ccc283ba90f0dbe",
  "de3736679b42c786a14addac94fa1bec815b51999e3eac2469eb9428c61a803d",
  "10e67fd19f6e7e2461e602594c42677855e271129b8d51bb670f76140f68d8ad",
  "1ce3777afbb67877439f3620cab8c3244a046815bdd45460033ea73ea5117606",
  "4bb4b3d77fe4b963476bdc9e93af48a286903089ed94a632df2e2e740e14954b",
  "960160ad499c088b89718cfa9c32e3aac8e8a68e37ed3016f9d8faa2d4c080bd",
  "4d61e63bd5980c7dcaf9fdff7409889dc305911dac238cfa7bf2218409167227",
  "c9a3c4bc07caee4cef22d0bdcd95074b68a00b24bc8550aacdf01ff24646bae9",
  "c10e8d8c5ca8c67efd34c3113a4d6b81b78bd37fbc3a02b883a0017c8b122401",
  "5e1ac92c9b07fbe4bfeeb7a86ae1a7442ab74acaa6ac4608503ff9c950c66c52",
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
        currentOnlySha256: "52f958662d1cac5ccce0573b741ed35d194f066a6bbe72c5c6e989eb9048f528",
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
