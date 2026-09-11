import { join } from "node:path";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, readPrivateStateFileIfPresent, writePrivateJsonIfUnchanged } from "../storage";
import { canonicalJson, sha256 } from "../canonical-json";
import type { CheckedApproval, WebRule } from "./protocol";
import { boolean, ControlError, integer, keys, parseWebRule, publicUrl, record } from "./validation";

export type ControlEnvironment = Readonly<Record<string, string | undefined>>;
export interface WebPolicy { readonly schema: 1; readonly revision: number; readonly gatewayOnly: boolean; readonly rules: readonly WebRule[] }
const EMPTY: WebPolicy = {schema:1,revision:0,gatewayOnly:false,rules:[]};
function paths(environment: ControlEnvironment) {
  const directory=join(ghostgetStateHome(environment),"control");
  return {directory,policy:join(directory,"web-policy.json"),marker:join(directory,"web-managed.json")};
}
function parsePolicy(text: string): WebPolicy {
  const v=record(JSON.parse(text)); keys(v,["schema","revision","gatewayOnly","rules"]);
  if(v.schema!==1 || !Array.isArray(v.rules) || v.rules.length>128) throw new Error("invalid web policy");
  const rules=v.rules.map(parseWebRule); if(new Set(rules.map(rule=>rule.id)).size!==rules.length) throw new Error("duplicate web rule");
  return {schema:1,revision:integer(v.revision,1,Number.MAX_SAFE_INTEGER),gatewayOnly:boolean(v.gatewayOnly),rules};
}
function snapshot(environment: ControlEnvironment): {policy:WebPolicy;text:string|null} {
  const p=paths(environment);
  try {
    const marker=readPrivateStateFileIfPresent(p.marker,128,"web policy marker",environment);
    const text=readPrivateStateFileIfPresent(p.policy,262144,"web policy",environment);
    if(marker===null && text===null) return {policy:EMPTY,text:null};
    if(marker===null || text===null || canonicalJson(JSON.parse(marker))!==canonicalJson({schema:1,managed:true})) throw new Error("incomplete web policy");
    return {policy:parsePolicy(text),text};
  } catch { throw new ControlError("WEB_POLICY_UNAVAILABLE","Web policy is missing, unsafe, or invalid. Requests are blocked."); }
}
export function readWebPolicy(environment: ControlEnvironment=process.env): WebPolicy { return snapshot(environment).policy; }
export function saveWebPolicy(rules:readonly WebRule[], gatewayOnly:boolean, expectedRevision:number, environment:ControlEnvironment=process.env): WebPolicy {
  const previous=snapshot(environment); if(previous.policy.revision!==expectedRevision) throw new ControlError("STALE_POLICY","Web rules changed. Refresh before saving.");
  const policy=parsePolicy(JSON.stringify({schema:1,revision:expectedRevision+1,gatewayOnly,rules}));
  const p=paths(environment); ensurePrivateStateDirectory(p.directory,environment);
  createPrivateJsonIfAbsent(p.marker,{schema:1,managed:true},{environment});
  const committed=previous.text===null ? createPrivateJsonIfAbsent(p.policy,policy,{environment}).created : writePrivateJsonIfUnchanged(p.policy,policy,{expectedCurrentContentSha256:sha256(previous.text)});
  if(!committed) throw new ControlError("STALE_POLICY","Web rules changed. Refresh before saving.");
  return policy;
}
export interface CheckedWebRequest { readonly approval:CheckedApproval; readonly url:URL; readonly method:"GET"|"HEAD"; readonly maxResponseBytes:number; readonly timeoutMs:number; readonly ruleIds:readonly string[]; readonly endpoint:string|null }
export function checkWebRequest(method:"GET"|"HEAD", rawUrl:string, environment:ControlEnvironment=process.env): CheckedWebRequest {
  const url=publicUrl(rawUrl); const policy=readWebPolicy(environment);
  const matches=policy.rules.filter(rule=>rule.origin===url.origin && rule.methods.includes(method) && (rule.path.kind==="exact" ? url.pathname===rule.path.value : url.pathname.startsWith(rule.path.value)) && (rule.decision==="deny" || [...url.searchParams.keys()].every(key=>rule.queryKeys.includes(key))));
  const decision=matches.length===0 || matches.some(rule=>rule.decision==="deny") ? "deny" : matches.some(rule=>rule.decision==="ask") ? "ask" : "allow";
  const ids=matches.map(rule=>rule.id).sort();
  return {url,method,ruleIds:ids,endpoint:matches.length===1?matches[0]!.path.value:null,maxResponseBytes:Math.min(2_000_000,...matches.map(rule=>rule.maxResponseBytes)),timeoutMs:Math.min(30_000,...matches.map(rule=>rule.timeoutMs)),approval:{digest:sha256(canonicalJson({schema:1,method,url:url.href,policy})),revision:policy.revision,decision,kind:"web",title:`${method} ${url.hostname}`,account:null,effect:"Public web retrieval",preview:`${method} ${url.href}\nRules: ${ids.join(", ") || "No matching rule"}\nNo cookies, authorization headers, redirects, or retries.`}};
}
/** Application gateway mode covers the supported CLI, not other processes or same-user code. */
export function assertGatewayCommandAllowed(args: readonly string[], environment:ControlEnvironment=process.env): void {
  if(!readWebPolicy(environment).gatewayOnly) return;
  const first=args[0];
  if(first==="web" || first==="capabilities" || first==="--version" || first==="help" || first==="--help" || first==="-h" || args.length===0) return;
  if((first==="plugin"||first==="plugins") && ["list","show"].includes(args[1]??"")) return;
  throw new ControlError("GATEWAY_ONLY","This state home permits web gateway requests only. Use ghostget web request or change the mode in the native app.");
}
