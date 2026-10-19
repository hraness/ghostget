import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { manifestHash, parseRuntimeManifest } from "../model";
import type { ProviderPluginRegistry } from "../provider-plugin-registry";

/** Display provenance comes from exact current bundled bytes, never absence of a receipt. */
export function bundledInterfaceDigests(registry:ProviderPluginRegistry):ReadonlyMap<string,string> {
  const directory=fileURLToPath(new URL("../assets/adapters/",import.meta.url));const result=new Map<string,string>();
  for(const folder of readdirSync(directory,{withFileTypes:true})) {
    if(!folder.isDirectory()||! /^[a-z0-9-]+$/u.test(folder.name))continue;
    for(const filename of ["wrench-adapter.json","wrench-web-adapter.json"]) {
      let text:string;try{text=readFileSync(join(directory,folder.name,filename),"utf8");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")continue;throw error;}
      const parsed=parseRuntimeManifest(JSON.parse(text) as unknown,registry);
      if(!parsed.ok)continue;
      result.set(parsed.value.id,manifestHash(parsed.value));
    }
  }
  return result;
}
