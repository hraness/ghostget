import { resolve } from "node:path";
import { providerPluginRegistry } from "../provider-plugins";
import { createPortableProviderPluginCatalog } from "../provider-plugin-portable-catalog";
import { readRegularFile } from "../storage";
import { exportInterfaces, listInterfaces, saveInterface } from "./interfaces";
import { ControlError, identifier } from "./validation";
import type { ControlEnvironment } from "./web-policy";

/** Agent editing ends at an inert draft; activation is an explicit native review. */
export function runInterfaceCommand(args:readonly string[],environment:ControlEnvironment,output:{stdout:(value:string)=>unknown;stderr:(value:string)=>unknown}):number {
  try {
    if(args.length===1||args[1]==="--help"){output.stdout("Usage: ghostget interface list\n       ghostget interface export [adapter]\n       ghostget interface import <openapi.json> [--expected-digest <sha256>]\nImport saves an inert draft. Review and activate it in the native app.\n");return 0;}
    const context={environment,registry:createPortableProviderPluginCatalog(providerPluginRegistry,environment).registry};
    if(args[1]==="list"&&args.length===2){output.stdout(`${JSON.stringify({interfaces:listInterfaces(context)})}\n`);return 0;}
    if(args[1]==="export"&&(args.length===2||args.length===3)){output.stdout(exportInterfaces({adapterId:args[2]===undefined?null:identifier(args[2]),...context}).text);return 0;}
    if(args[1]==="import"&&(args.length===3||args.length===5&&args[3]==="--expected-digest")){
      const document=readRegularFile(resolve(args[2]!),524288,"OpenAPI interface");
      const draft=saveInterface({document,source:"user",expectedDigest:args[4]??null,...context});output.stdout(`${JSON.stringify({draft})}\n`);return 0;
    }
    throw new ControlError("INVALID_REQUEST","Run ghostget interface --help for the supported draft commands.");
  } catch(error){output.stderr(`${JSON.stringify({ok:false,code:error instanceof ControlError?error.code:"INTERFACE_INVALID",message:error instanceof ControlError?error.message:"The OpenAPI document, expected revision, or installed semantic binding is invalid. No interface was activated."})}\n`);return 1;}
}
