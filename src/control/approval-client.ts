import { connect } from "node:net";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ghostgetStateHome, snapshotPrivateStateDirectory } from "../storage";
import type { AgentApprovalResponse, ApprovalTarget } from "./protocol";
import { ControlError, digest, identifier, keys, oneOf, record } from "./validation";
import type { ControlEnvironment } from "./web-policy";

export interface ApprovalLease {readonly id:string;readonly digest:string}
export function controlSocketPath(environment:ControlEnvironment=process.env):string {return join(ghostgetStateHome(environment),"control","agent.sock");}
export async function agentRequest(payload:unknown,options:{environment:ControlEnvironment;signal?:AbortSignal;timeoutMs?:number}):Promise<unknown> {
  const path=controlSocketPath(options.environment);
  const data=Buffer.from(`${JSON.stringify(payload)}\n`);if(data.length>262144) throw new ControlError("REQUEST_TOO_LARGE","The agent request is too large.");
  try {
    snapshotPrivateStateDirectory(join(ghostgetStateHome(options.environment),"control"),options.environment);
    const stat=lstatSync(path);if(!stat.isSocket()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600) throw new Error();
  } catch {throw new ControlError("CONTROL_APP_REQUIRED","Open the Ghostget app to use the gateway or request human approval.");}
  return await new Promise((resolve,reject)=>{
    const socket=connect({path});let received=Buffer.alloc(0);let settled=false;
    const finish=(error:unknown,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener("abort",abort);socket.destroy();if(error)reject(error);else resolve(value);};
    const abort=()=>finish(new ControlError("REQUEST_CANCELLED","The request was cancelled."));
    const timer=setTimeout(()=>finish(new ControlError("CONTROL_TIMEOUT","The app did not respond before the request deadline.")),options.timeoutMs??5000);
    options.signal?.addEventListener("abort",abort,{once:true});if(options.signal?.aborted){abort();return;}
    socket.once("connect",()=>socket.write(data));
    socket.on("data",chunk=>{received=Buffer.concat([received,typeof chunk === "string" ? Buffer.from(chunk) : chunk]);if(received.length>4_194_304){finish(new ControlError("INVALID_RESPONSE","The app response exceeded its limit."));return;}const end=received.indexOf(10);if(end<0)return;try{if(received.subarray(end+1).length)throw new Error();finish(null,JSON.parse(received.subarray(0,end).toString("utf8")));}catch{finish(new ControlError("INVALID_RESPONSE","The app response was invalid."));}});
    socket.once("error",()=>finish(new ControlError("CONTROL_DISCONNECTED","The Ghostget app disconnected.")));
    socket.once("end",()=>finish(new ControlError("CONTROL_DISCONNECTED","The Ghostget app disconnected.")));
  });
}
function response(value:unknown,lease:ApprovalLease):AgentApprovalResponse {
  const v=record(value);keys(v,["protocol","status","id","digest"]);
  if(v.protocol!=="ghostget.approval/1"||v.id!==lease.id||v.digest!==lease.digest) throw new ControlError("INVALID_RESPONSE","The approval response did not match this request.");
  return {protocol:"ghostget.approval/1",id:identifier(v.id),digest:digest(v.digest),status:oneOf(v.status,["pending","allowed","denied","expired","cancelled","invalid"])};
}
export async function requestApproval(target:ApprovalTarget,expectedDigest:string,options:{environment:ControlEnvironment;signal?:AbortSignal}):Promise<ApprovalLease> {
  const lease={id:randomUUID(),digest:expectedDigest};
  try {
    let current=response(await agentRequest({protocol:"ghostget.approval/1",action:"request",id:lease.id,target,expectedDigest},options),lease);
    const deadline=Date.now()+120_000;
    while(current.status==="pending"&&Date.now()<deadline){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{options.signal?.removeEventListener("abort",abort);resolve();},400);const abort=()=>{clearTimeout(timer);reject(new ControlError("REQUEST_CANCELLED","The request was cancelled."));};if(options.signal?.aborted){abort();return;}options.signal?.addEventListener("abort",abort,{once:true});});current=response(await agentRequest({protocol:"ghostget.approval/1",action:"check",...lease},options),lease);}
    if(current.status!=="allowed") throw new ControlError("APPROVAL_REQUIRED","This operation was not approved. Review it in Ghostget and retry explicitly.");
    return lease;
  } catch(error) {await releaseApproval(lease,options).catch(()=>undefined);throw error;}
}
export async function checkApproval(lease:ApprovalLease,options:{environment:ControlEnvironment;signal?:AbortSignal}):Promise<void> {
  if(response(await agentRequest({protocol:"ghostget.approval/1",action:"check",...lease},options),lease).status!=="allowed") throw new ControlError("APPROVAL_EXPIRED","The exact approval is no longer valid.");
}
export async function releaseApproval(lease:ApprovalLease,options:{environment:ControlEnvironment}):Promise<void> {await agentRequest({protocol:"ghostget.approval/1",action:"cancel",...lease},options);}
