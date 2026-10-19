import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// Independently sampled from the exact 91fedeeb source, excluding only the
// removed providers. This binds every remaining current writer and every
// registered predecessor implementation, including historical route versions.
const PRESERVED_ROWS = 374;
const PRESERVED_SHA256 = "8fabd587c03df5a515e8fc2350001bda2e42296c142cd8da3f2a14e0aff8bf6b";
const inventoryProgram = `
import { createHash } from "node:crypto";
const root = ${JSON.stringify(import.meta.dir)};
const [{createProviderPluginRegistry},{generatedProviderPlugins},official,web,local] = await Promise.all([
  import(root+"/provider-plugin-registry.ts"), import(root+"/provider-plugins.generated.ts"),
  import(root+"/provider-contracts.ts"), import(root+"/web-session-contracts.ts"), import(root+"/local-cli-contracts.ts"),
]);
const registry = createProviderPluginRegistry(generatedProviderPlugins);
const inventory = [];
let acceptedCurrent = true, rejectedUnknown = true;
for (const plugin of registry.list()) for (const binding of plugin.bindings) {
  for (const operation of binding.operations) for (const contractVersion of operation.contractVersions) {
    const contract = binding.transport === "provider-api"
      ? official.getProviderContract({provider:binding.surfaceId,action:operation.name,contractVersion},registry)
      : binding.transport === "local-cli"
        ? local.getLocalCliContract({surface:binding.surfaceId,action:operation.name,contractVersion},registry)
        : web.getWebSessionContract({site:binding.surfaceId,action:operation.name,contractVersion,timeoutMs:60000,maxOutputBytes:2097152},registry);
    const hash = binding.transport === "provider-api" ? official.providerContractHash : binding.transport === "local-cli" ? local.localCliContractHash : web.webSessionContractHash;
    const compatible = binding.transport === "provider-api" ? official.isCompatibleProviderContractHash : binding.transport === "local-cli" ? local.isCompatibleLocalCliContractHash : web.isCompatibleWebSessionContractHash;
    const writer = hash(contract,registry);
    acceptedCurrent &&= compatible(contract,writer,registry);
    rejectedUnknown &&= !compatible(contract,"f".repeat(64),registry);
    inventory.push([plugin.id,binding.transport,binding.surfaceId,operation.name,contractVersion,writer,
      registry.legacyContractImplementationHashes(binding,operation.name,contractVersion).map(value=>value.toString("hex")).sort()]);
  }
}
inventory.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
process.stdout.write(JSON.stringify({rows:inventory.length,sha256:createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),acceptedCurrent,rejectedUnknown}));
`;

async function inventoryForNodeEnv(nodeEnv: string | undefined): Promise<unknown> {
  const environment = { ...process.env };
  if (nodeEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = nodeEnv;
  const child = Bun.spawn({cmd:[process.execPath,"-e",inventoryProgram],cwd:join(import.meta.dir,".."),env:environment,stdout:"pipe",stderr:"pipe"});
  const [code, stdout, stderr] = await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(`contract inventory child failed for NODE_ENV=${nodeEnv ?? "<unset>"}: ${stderr}`);
  return JSON.parse(stdout);
}

describe("durable provider contract inventory", () => {
  test("preserves all remaining current and predecessor identities across execution modes", async () => {
    const inventories = await Promise.all([undefined,"test","production","development","staging"].map(inventoryForNodeEnv));
    for (const inventory of inventories) expect(inventory).toEqual({rows:PRESERVED_ROWS,sha256:PRESERVED_SHA256,acceptedCurrent:true,rejectedUnknown:true});
  });
});
