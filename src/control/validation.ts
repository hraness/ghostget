import { CONTROL_PROTOCOL, type ActivityQuery, type ControlRequest, type ControlResponse, type PermissionDecision, type WebRule } from "./protocol";

/** Keep oversized catalog reads local to one request; never terminate approvals. */
export function controlResponseLine(id: string, response: ControlResponse): string {
  const line = `${JSON.stringify({ id, protocol: CONTROL_PROTOCOL, ...response })}\n`;
  if (Buffer.byteLength(line) <= 4_194_304) return line;
  return `${JSON.stringify({ id, protocol: CONTROL_PROTOCOL, ok: false, code: "CONTROL_RESPONSE_TOO_LARGE", message: "Your catalog exceeds the app's response limit. Use the CLI to inspect installed interfaces." })}\n`;
}

export class ControlError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export function invalid(): never { throw new ControlError("INVALID_REQUEST", "The request is invalid or exceeds its limits."); }
export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) invalid();
}
export function string(value: unknown, max = 256, min = 1): string {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return invalid();
  return value;
}
export function identifier(value: unknown): string {
  const result = string(value, 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(result)) return invalid();
  return result;
}
export function nullable(value: unknown, max = 256): string | null { return value === null ? null : string(value, max); }
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}
export function boolean(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
export function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) return invalid(); return value as T;
}
export function strings(value: unknown, max: number, itemMax = 256): string[] {
  if (!Array.isArray(value) || value.length > max) return invalid();
  const result = value.map(item => string(item, itemMax));
  if (new Set(result).size !== result.length) invalid();
  return result;
}
export function digest(value: unknown): string { const result=string(value,64); if (!/^[a-f0-9]{64}$/u.test(result)) invalid(); return result; }
export function decision(value: unknown): PermissionDecision { return oneOf(value,["allow","deny","ask"]); }

/** Reject normalization ambiguity before applying exact-origin and path rules. */
export function publicUrl(value: unknown): URL {
  const raw=string(value,8192);
  if (/\s|\\/u.test(raw) || /%(?:00|0a|0d|2f|5c|2e|25)/iu.test(raw)) invalid();
  let url: URL;
  try { url=new URL(raw); } catch { return invalid(); }
  if (url.protocol!=="https:" || url.username || url.password || url.hash || url.port || url.hostname.endsWith(".") || url.href!==raw || url.hostname.includes(":") || /^\d+(?:\.\d+)*$/u.test(url.hostname)) invalid();
  // Servers differ in decoded-path, matrix-parameter and repeated-slash routing.
  // The first gateway version admits only the unambiguous literal path subset.
  if (/%|;|\/\//u.test(url.pathname)) invalid();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(url.hostname)) invalid();
  if (["localhost","local","internal","test","invalid","example","onion"].some(tld=>url.hostname.endsWith(`.${tld}`))) invalid();
  if (new Set(url.searchParams.keys()).size!==[...url.searchParams.keys()].length) invalid();
  return url;
}
export function parseWebRule(value: unknown): WebRule {
  const v=record(value); keys(v,["id","origin","path","methods","queryKeys","decision","effect","maxResponseBytes","timeoutMs"]);
  const origin=string(v.origin,256); const url=publicUrl(`${origin}/`);
  if (url.origin!==origin) invalid();
  const path=record(v.path); keys(path,["kind","value"]);
  const kind=oneOf(path.kind,["exact","prefix"]); const pathValue=string(path.value,1024);
  const target=publicUrl(`${origin}${pathValue}`);
  if (target.pathname!==pathValue || target.search || kind==="prefix" && !pathValue.endsWith("/")) invalid();
  const methods=strings(v.methods,2).map(method=>oneOf(method,["GET","HEAD"] as const)); if (!methods.length) invalid();
  const queryKeys=strings(v.queryKeys,32,64); if (queryKeys.some(key=>! /^[a-zA-Z0-9_.-]+$/u.test(key))) invalid();
  return {id:identifier(v.id),origin,path:{kind,value:pathValue},methods,queryKeys,decision:decision(v.decision),effect:oneOf(v.effect,["retrieval"]),maxResponseBytes:integer(v.maxResponseBytes,1,2_000_000),timeoutMs:integer(v.timeoutMs,1000,60_000)};
}
export function parseActivityQuery(value: unknown): ActivityQuery {
  const v=record(value); keys(v,["search","method","outcome","origin","since","order","cursor","limit"]);
  const since=nullable(v.since,32); if (since!==null && (!Number.isFinite(Date.parse(since)) || new Date(since).toISOString()!==since)) invalid();
  const origin=nullable(v.origin,256); if (origin!==null && publicUrl(`${origin}/`).origin!==origin) invalid();
  return {search:string(v.search,128,0),method:oneOf(v.method,["all","GET","HEAD"]),outcome:oneOf(v.outcome,["all","started","succeeded","denied","failed","cancelled","interrupted"]),origin,since,order:oneOf(v.order,["newest","oldest"]),cursor:nullable(v.cursor,1024),limit:integer(v.limit,1,100)};
}
export function parseControlRequest(value: unknown): ControlRequest {
  const v=record(value); const action=string(v.action,32);
  const exact=(...fields: string[])=>keys(v,["action",...fields]);
  switch(action) {
    case "snapshot": exact("accountId"); return {action,accountId:nullable(v.accountId,128)};
    case "approval.list": exact(); return {action};
    case "permission.enable": exact("expectedRevision"); return {action,expectedRevision:integer(v.expectedRevision,0,Number.MAX_SAFE_INTEGER)};
    case "permission.set": exact("adapterId","operationId","accountId","decision","expectedRevision","expectedCapabilityDigest"); return {action,adapterId:identifier(v.adapterId),operationId:identifier(v.operationId),accountId:nullable(v.accountId,128),decision:decision(v.decision),expectedRevision:integer(v.expectedRevision,0,Number.MAX_SAFE_INTEGER),expectedCapabilityDigest:digest(v.expectedCapabilityDigest)};
    case "approval.decide": exact("id","digest","decision"); return {action,id:identifier(v.id),digest:digest(v.digest),decision:oneOf(v.decision,["allow-once","deny"])};
    case "web.save": { exact("rules","gatewayOnly","expectedRevision"); if (!Array.isArray(v.rules)||v.rules.length>128) invalid(); const rules=v.rules.map(parseWebRule); if(new Set(rules.map(rule=>rule.id)).size!==rules.length) invalid(); return {action,rules,gatewayOnly:boolean(v.gatewayOnly),expectedRevision:integer(v.expectedRevision,0,Number.MAX_SAFE_INTEGER)}; }
    case "activity.query": exact("query"); return {action,query:parseActivityQuery(v.query)};
    case "interface.save": exact("document","source","expectedDigest"); return {action,document:string(v.document,524288),source:oneOf(v.source,["user","imported"]),expectedDigest:v.expectedDigest===null?null:digest(v.expectedDigest)};
    case "interface.activate": exact("id","digest","adapterId","expectedInstalledDigest"); return {action,id:identifier(v.id),digest:digest(v.digest),adapterId:identifier(v.adapterId),expectedInstalledDigest:v.expectedInstalledDigest===null?null:digest(v.expectedInstalledDigest)};
    case "interface.export": exact("adapterId"); return {action,adapterId:nullable(v.adapterId,128)};
    case "connection.begin": exact("id","provider","browser","profile","expectedRevision"); return {action,id:identifier(v.id),provider:identifier(v.provider),browser:oneOf(v.browser,["chrome","safari"]),profile:nullable(v.profile,128),expectedRevision:v.expectedRevision===null?null:digest(v.expectedRevision)};
    case "connection.verify": case "connection.cancel": exact("attemptId"); return {action,attemptId:identifier(v.attemptId)};
    case "connection.commit": exact("attemptId","expectedSubject"); return {action,attemptId:identifier(v.attemptId),expectedSubject:string(v.expectedSubject,256)};
    case "connection.disconnect": exact("id","expectedRevision"); return {action,id:identifier(v.id),expectedRevision:digest(v.expectedRevision)};
    case "vault.import": exact("id","account","reference","expectedSubject","scopes","expiresAt","expectedRevision"); return {action,id:identifier(v.id),account:string(v.account,256),reference:string(v.reference,1024),expectedSubject:string(v.expectedSubject,256),scopes:strings(v.scopes,32),expiresAt:nullable(v.expiresAt,32),expectedRevision:v.expectedRevision===null?null:digest(v.expectedRevision)};
    case "prompt": exact("kind","adapterId"); return {action,kind:oneOf(v.kind,["install","use","extend","gateway"]),adapterId:nullable(v.adapterId,128)};
    default: return invalid();
  }
}
