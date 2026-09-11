import { createServer, connect, type Socket } from "node:net";
import { chmodSync, lstatSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "../canonical-json";
import { captureProcessOwnerIdentity, processOwnerStatus } from "../process-identity";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, readPrivateStateFileIfPresent, removePrivateStateFileIfUnchanged, snapshotPrivateStateDirectory, writePrivateJsonIfUnchanged } from "../storage";
import { controlSocketPath } from "./approval-client";
import { CONTROL_PROTOCOL, type ApprovalTarget, type JsonValue } from "./protocol";
import { controlFailure, ControlService } from "./service";
import { ControlError, controlResponseLine, digest, identifier, integer, keys, nullable, oneOf, parseControlRequest, record, string } from "./validation";
import type { ControlEnvironment } from "./web-policy";
import { vaultId } from "./vault-store";
import { CREDENTIAL_REQUEST_TIMEOUT_MS } from "./vault-model";

function parseTarget(value:unknown):ApprovalTarget {
  const v=record(value);
  if(v.kind==="credential"){keys(v,["kind","grantId"]);return {kind:"credential",grantId:vaultId(v.grantId)};}
  if(v.kind==="web"){keys(v,["kind","method","url"]);return {kind:"web",method:oneOf(v.method,["GET","HEAD"]),url:string(v.url,8192)};}
  keys(v,["kind","adapterId","operationId","authId","input","planDigest"]);if(v.kind!=="provider")throw new Error("invalid target");
  // The kernel's operation input parser is authoritative; bound recursive JSON before calling it.
  const inspect=(item:unknown,depth:number):void=>{if(depth>24)throw new Error("deep input");if(item===null||typeof item==="boolean"||typeof item==="string"||typeof item==="number"&&Number.isFinite(item))return;if(Array.isArray(item)){if(item.length>1024)throw new Error("large input");for(const child of item)inspect(child,depth+1);return;}const object=record(item);if(Object.keys(object).length>256)throw new Error("large input");for(const child of Object.values(object))inspect(child,depth+1);};inspect(v.input,0);
  return {kind:"provider",adapterId:identifier(v.adapterId),operationId:identifier(v.operationId),authId:nullable(v.authId,128),input:v.input as JsonValue,planDigest:v.planDigest===null?null:digest(v.planDigest)};
}
async function handleAgent(value:unknown,service:ControlService,signal:AbortSignal):Promise<unknown> {
  const v=record(value);
  if(v.protocol==="ghostget.setup/1")return service.setupStatus(value);
  if(v.protocol==="ghostget.credential/1"){keys(v,["protocol","action","grantId"]);if(v.action!=="use")throw new Error("invalid action");return await service.credentials.run(vaultId(v.grantId),signal);}
  if(v.protocol==="ghostget.web/1") {keys(v,["protocol","action","method","url"]);if(v.action!=="request")throw new Error("invalid action");return await service.gateway.run(oneOf(v.method,["GET","HEAD"]),string(v.url,8192),signal);}
  if(v.protocol!=="ghostget.approval/1")throw new Error("invalid protocol");
  if(v.action==="request"){keys(v,["protocol","action","id","target","expectedDigest"]);return await service.approvals.request(identifier(v.id),parseTarget(v.target),digest(v.expectedDigest));}
  keys(v,["protocol","action","id","digest"]);const id=identifier(v.id);const hash=digest(v.digest);
  if(v.action==="check")return await service.approvals.check(id,hash);
  if(v.action==="cancel")return service.approvals.cancel(id,hash);
  throw new Error("invalid action");
}
function socketLive(path:string):Promise<boolean> {
  return new Promise((resolve,reject)=>{const socket=connect({path});const timer=setTimeout(()=>{socket.destroy();reject(new Error("socket state unknown"));},1000);socket.once("connect",()=>{clearTimeout(timer);socket.destroy();resolve(true);});socket.once("error",error=>{clearTimeout(timer);socket.destroy();if((error as NodeJS.ErrnoException).code==="ECONNREFUSED")resolve(false);else reject(new Error("socket state unknown"));});});
}
function acquireOwner(environment:ControlEnvironment):()=>void {
  const directory=join(ghostgetStateHome(environment),"control");ensurePrivateStateDirectory(directory,environment);
  const path=join(directory,"owner.json");const previous=readPrivateStateFileIfPresent(path,2048,"control owner",environment);
  if(previous!==null){const v=record(JSON.parse(previous));keys(v,["schema","pid","bootId","processStartId","generation"]);if(v.schema!==1)throw new Error("invalid owner");const owner={pid:integer(v.pid,1,2**31-1),bootId:digest(v.bootId),processStartId:digest(v.processStartId)};identifier(v.generation);if(processOwnerStatus(owner)!=="different-or-dead")throw new ControlError("CONTROL_ALREADY_RUNNING","Ghostget is already open for this state home, or its previous owner cannot be verified.");}
  const next={schema:1,...captureProcessOwnerIdentity(process.pid),generation:randomUUID()};
  const acquired=previous===null?createPrivateJsonIfAbsent(path,next,{environment}).created:writePrivateJsonIfUnchanged(path,next,{expectedCurrentContentSha256:sha256(previous)});
  if(!acquired)throw new ControlError("CONTROL_ALREADY_RUNNING","Another Ghostget app opened this state home.");
  const expectedCurrentContentSha256=sha256(`${canonicalJson(next)}\n`);
  return ()=>{removePrivateStateFileIfUnchanged(path,{expectedCurrentContentSha256},environment);};
}

/** Private native stdio is the only administrative transport. No TCP listener is created. */
export async function runControlHelper(environment:ControlEnvironment=process.env):Promise<void> {
  process.umask(0o077);
  const releaseOwner=acquireOwner(environment);const socketPath=controlSocketPath(environment);const clients=new Set<Socket>();const active=new Set<Promise<void>>();
  let service:ControlService|undefined;let ownedSocket:{dev:number;ino:number}|undefined;let closing=false;let controlActive=0;
  const directory=join(ghostgetStateHome(environment),"control");const directoryIdentity=ensurePrivateStateDirectory(directory,environment);
  const server=createServer(socket=>{
    if(closing||clients.size>=16||service===undefined){socket.destroy();return;}
    clients.add(socket);const controller=new AbortController();let buffer=Buffer.alloc(0);let started=false;
    socket.setTimeout(150_000,()=>socket.destroy());
    socket.on("close",()=>{controller.abort();clients.delete(socket);});socket.on("error",()=>controller.abort());
    socket.on("data",chunk=>{
      if(started){socket.destroy();return;}buffer=Buffer.concat([buffer,typeof chunk==="string"?Buffer.from(chunk):chunk]);if(buffer.length>262144){socket.destroy();return;}const newline=buffer.indexOf(10);if(newline<0)return;
      started=true;const work=(async()=>{let response:unknown;try{if(newline!==buffer.length-1)throw new Error();const value:unknown=JSON.parse(buffer.subarray(0,newline).toString("utf8"));const frame=record(value);socket.setTimeout(frame.protocol==="ghostget.credential/1"?CREDENTIAL_REQUEST_TIMEOUT_MS:frame.protocol==="ghostget.web/1"?180_000:150_000);response=await handleAgent(value,service!,controller.signal);}catch(error){response=controlFailure(error);}if(!socket.destroyed)socket.end(`${JSON.stringify(response)}\n`);})();active.add(work);void work.then(()=>active.delete(work),()=>{active.delete(work);process.exitCode=1;process.stdin.destroy();});
    });
  });
  const shutdown=async()=>{if(closing)return;closing=true;for(const socket of clients)socket.destroy();service?.beginShutdown();await Promise.allSettled(active);service?.close();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));if(ownedSocket!==undefined){snapshotPrivateStateDirectory(directory,environment,directoryIdentity);try{const stat=lstatSync(socketPath);if(stat.isSocket()&&stat.dev===ownedSocket.dev&&stat.ino===ownedSocket.ino)unlinkSync(socketPath);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}releaseOwner();};
  const termination=()=>{process.stdin.destroy();};process.once("SIGTERM",termination);process.once("SIGINT",termination);
  try {
    if(Buffer.byteLength(socketPath)>100)throw new ControlError("CONTROL_PATH_TOO_LONG","Choose a shorter Ghostget state-home path for the native app.");
    let stale:ReturnType<typeof lstatSync>|undefined;try{stale=lstatSync(socketPath);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    if(stale!==undefined){if(!stale.isSocket()||stale.uid!==process.getuid?.()||(Number(stale.mode)&0o777)!==0o600||await socketLive(socketPath))throw new ControlError("CONTROL_ALREADY_RUNNING","The control socket is already in use or unsafe.");snapshotPrivateStateDirectory(directory,environment,directoryIdentity);const current=lstatSync(socketPath);if(current.dev!==stale.dev||current.ino!==stale.ino)throw new Error("socket changed");unlinkSync(socketPath);}
    await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(socketPath,()=>{server.off("error",reject);resolve();});});chmodSync(socketPath,0o600);const socketStat=lstatSync(socketPath);ownedSocket={dev:socketStat.dev,ino:socketStat.ino};
    service=new ControlService(environment);
    let buffer=Buffer.alloc(0);
    for await(const chunk of process.stdin){if(closing)break;buffer=Buffer.concat([buffer,typeof chunk==="string"?Buffer.from(chunk):chunk]);if(buffer.length>4_194_304)throw new Error("control frame too large");let newline:number;
      while((newline=buffer.indexOf(10))>=0){const frame=buffer.subarray(0,newline);buffer=buffer.subarray(newline+1);if(controlActive>=8)throw new Error("too many control requests");controlActive++;
        const work=(async()=>{let id="invalid";let response;try{const v=record(JSON.parse(frame.toString("utf8")));keys(v,["id","protocol","request"]);id=identifier(v.id);if(v.protocol!==CONTROL_PROTOCOL)throw new Error("wrong protocol");response=await service!.request(parseControlRequest(v.request));}catch(error){response=controlFailure(error);}const output=controlResponseLine(id,response);if(!closing)process.stdout.write(output);})().finally(()=>{controlActive--;});active.add(work);void work.then(()=>active.delete(work),()=>{active.delete(work);process.exitCode=1;process.stdin.destroy();});
      }
    }
    if(buffer.length!==0)throw new Error("partial control frame");
  } finally {process.off("SIGTERM",termination);process.off("SIGINT",termination);await shutdown();}
}
if(import.meta.main){try{await runControlHelper();}catch{process.stderr.write("Ghostget control helper stopped safely.\n");process.exitCode=1;}}
