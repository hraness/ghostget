import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const samples: { phase: string; wallMs: number; cpuMs: number; rssBytes: number; heapUsedBytes: number }[] = [];
async function measure<T>(phase: string, work: () => T | Promise<T>): Promise<T> {
  const started = performance.now(); const cpu = process.cpuUsage();
  const result = await work();
  const usage = process.cpuUsage(cpu); const memory = process.memoryUsage();
  const sample = { phase, wallMs: performance.now() - started, cpuMs: (usage.user + usage.system) / 1_000, rssBytes: memory.rss, heapUsedBytes: memory.heapUsed };
  samples.push(sample); console.log(JSON.stringify(sample)); return result;
}
const args=process.argv.slice(2);
const mode=args.length===0?"burst":args.length===2&&args[0]==="--idle"&&(args[1]==="full"||args[1]==="approvals")?args[1]:null;
if (mode===null) throw new Error("Usage: bun scripts/control-snapshot-benchmark.ts [--idle full|approvals]");
const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-snapshot-benchmark-"))); chmodSync(directory, 0o700);
const environment = { HOME: process.env.HOME, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: directory };
try {
  await measure("initial", () => undefined);
  const { ControlService } = await measure("import", () => import("../src/control/service"));
  const service = await measure("constructor", () => new ControlService(environment));
  try {
    const fullSnapshot = async(phase:string) => {
      const snapshot = await measure(phase, () => service.snapshot(null));
      if (snapshot.accounts.length !== 0 || snapshot.capabilities.length !== 0 || snapshot.interfaces.length !== 0) throw new Error("Benchmark state must stay empty");
    };
    await fullSnapshot("first-snapshot");
    if(mode==="burst") {
      for (let index = 1; index < 9; index++) await fullSnapshot(`repeat-${index}`);
      const { providerPluginRegistry } = await import("../src/provider-plugins");
      const { createPortableProviderPluginCatalog } = await import("../src/provider-plugin-portable-catalog");
      await measure("empty-portable-catalog", () => createPortableProviderPluginCatalog(providerPluginRegistry, environment));
      const { bundledInterfaceDigests } = await import("../src/control/bundled-interfaces");
      await measure("all-bundled-digests", () => bundledInterfaceDigests(providerPluginRegistry));
    } else {
      await measure("idle-window",async()=>{
        const started=performance.now();
        for(let index=1;index<=8;index++) {
          await Bun.sleep(Math.max(0,started+index*4000-performance.now()));
          if(mode==="full")await fullSnapshot(`full-poll-${index}`);
          else {
            const result=await measure(`approval-poll-${index}`,()=>service.request({action:"approval.list"}));
            if(!result.ok||result.data.kind!=="approvals"||result.data.approvals.length!==0)throw new Error("Benchmark approval list must stay empty");
          }
        }
      });
    }
  } finally { service.close(); }
  Bun.gc(true);
  await Bun.sleep(0);
  await measure("closed-forced-gc", () => undefined);
  console.log(JSON.stringify({ schema: "ghostget-control-snapshot-benchmark/1", mode, intervalMs:mode==="burst"?null:4000, bun: Bun.version, platform: process.platform, arch: process.arch, samples }));
} finally { rmSync(directory, { recursive: true, force: true }); }
