import { randomUUID } from "node:crypto";
import { pinnedHttpsFetch } from "../pinned-https";
import { ActivityStore } from "./activity";
import type { ApprovalBroker } from "./approval-broker";
import { checkWebRequest, type ControlEnvironment } from "./web-policy";
import { ControlError } from "./validation";

export interface WebResult {readonly protocol:"ghostget.web/1";readonly ok:true;readonly id:string;readonly status:number;readonly contentType:string;readonly bodyBase64:string;readonly bytes:number;readonly trusted:false}
export type GatewayTransport=(url:URL,init:RequestInit,timeoutMs:number,beforeRequest:()=>void)=>Promise<Response>;
const transportWithPolicy:GatewayTransport=(url,init,timeoutMs,beforeRequest)=>pinnedHttpsFetch(url,init,timeoutMs,{beforeRequest});
export class WebGateway {
  private active=0;
  constructor(private readonly activity:ActivityStore,private readonly approvals:ApprovalBroker,private readonly environment:ControlEnvironment=process.env,private readonly transport:GatewayTransport=transportWithPolicy) {}
  async run(method:"GET"|"HEAD",url:string,signal:AbortSignal):Promise<WebResult> {
    if(this.active>=8) throw new ControlError("GATEWAY_BUSY","Eight requests are already active. Retry later.");
    const checked=checkWebRequest(method,url,this.environment);const id=randomUUID();this.active++;
    let started=false;let finished=false;let response:Response|undefined;let bytes=0;let timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();const combined=AbortSignal.any([signal,controller.signal]);
    try {
      // This durable intent must succeed before approval or DNS/network access.
      this.activity.start({id,method,origin:checked.url.origin,ruleId:checked.ruleIds.join(",")||null,endpoint:checked.endpoint,decision:checked.approval.decision});started=true;
      if(checked.approval.decision==="deny") throw new ControlError("WEB_DENIED","No web rule permits this exact request.");
      if(checked.approval.decision==="ask") {
        const approval=await this.approvals.request(id,{kind:"web",method,url},checked.approval.digest);
        let status=approval.status;
        while(status==="pending") {
          combined.throwIfAborted();
          await new Promise<void>(resolve=>setTimeout(resolve,200));
          status=(await this.approvals.check(id,checked.approval.digest)).status;
        }
        if(status!=="allowed") throw new ControlError("WEB_DENIED","This web request was not approved.");
      }
      this.revalidate(method,url,checked.approval.digest);combined.throwIfAborted();
      timer=setTimeout(()=>controller.abort(),checked.timeoutMs);
      response=await this.transport(checked.url,{method,redirect:"error",credentials:"omit",headers:{Accept:"text/*, application/json", "Accept-Encoding":"identity", "User-Agent":"Ghostget-public-gateway"},signal:combined},checked.timeoutMs,()=>this.revalidate(method,url,checked.approval.digest));
      combined.throwIfAborted();
      if(response.status>=300&&response.status<400) throw new ControlError("WEB_REDIRECT_BLOCKED","The endpoint returned a redirect. Add and request its destination explicitly.");
      const encoding=response.headers.get("content-encoding");
      if(encoding!==null&&encoding.toLowerCase()!=="identity") throw new ControlError("WEB_ENCODING_UNSUPPORTED","Compressed responses are not supported by this gateway.");
      const contentType=(response.headers.get("content-type")??"application/octet-stream").split(";")[0]!.trim().toLowerCase();
      if(method!=="HEAD"&&!/^text\/[a-z0-9.+-]+$|^application\/(?:[a-z0-9.+-]+\+)?json$/u.test(contentType)) throw new ControlError("WEB_CONTENT_UNSUPPORTED","This gateway returns text and JSON responses only.");
      const length=response.headers.get("content-length");
      if(method!=="HEAD"&&length!==null&&(!/^\d+$/u.test(length)||Number(length)>checked.maxResponseBytes)) throw new ControlError("WEB_RESPONSE_TOO_LARGE","The response exceeds the rule's size limit.");
      const chunks:Uint8Array[]=[];const reader=response.body?.getReader();
      if(reader!==undefined) {
        const onAbort=()=>{void reader.cancel().catch(()=>undefined);};combined.addEventListener("abort",onAbort,{once:true});
        try {while(true){combined.throwIfAborted();const next=await reader.read();combined.throwIfAborted();if(next.done)break;bytes+=next.value.byteLength;if(bytes>checked.maxResponseBytes)throw new ControlError("WEB_RESPONSE_TOO_LARGE","The response exceeds the rule's size limit.");chunks.push(next.value);}}
        finally {combined.removeEventListener("abort",onAbort);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
      }
      const body=Buffer.concat(chunks);try{new TextDecoder("utf-8",{fatal:true}).decode(body);}catch{throw new ControlError("WEB_ENCODING_UNSUPPORTED","The response is not valid UTF-8 text.");}
      this.revalidate(method,url,checked.approval.digest);combined.throwIfAborted();
      if(checked.approval.decision==="ask"&&(await this.approvals.check(id,checked.approval.digest)).status!=="allowed") throw new ControlError("APPROVAL_EXPIRED","Approval changed before the result was returned.");
      this.activity.finish(id,{outcome:response.ok?"succeeded":"failed",httpStatus:response.status,responseBytes:bytes,errorCode:response.ok?null:"HTTP_ERROR"});finished=true;
      return {protocol:"ghostget.web/1",ok:true,id,status:response.status,contentType,bodyBase64:body.toString("base64"),bytes,trusted:false};
    } catch(error) {
      const cancelled=signal.aborted; const failure=cancelled?new ControlError("REQUEST_CANCELLED","The request was cancelled."):error instanceof ControlError?error:new ControlError(controller.signal.aborted?"WEB_TIMEOUT":"WEB_REQUEST_FAILED",controller.signal.aborted?"The request exceeded its time limit.":"The public web request failed.");
      if(started&&!finished) {try {this.activity.finish(id,{outcome:cancelled?"cancelled":failure.code==="WEB_DENIED"?"denied":"failed",httpStatus:response?.status??null,responseBytes:bytes,errorCode:failure.code});}catch{throw new ControlError("ACTIVITY_COMMIT_FAILED","The request may have reached the server, but its final history entry could not be committed. No response body was returned. Do not retry automatically.");}}
      throw failure;
    } finally {if(timer!==undefined)clearTimeout(timer);controller.abort();await response?.body?.cancel().catch(()=>undefined);this.approvals.cancel(id,checked.approval.digest);this.active--;}
  }
  private revalidate(method:"GET"|"HEAD",url:string,digest:string):void {const next=checkWebRequest(method,url,this.environment);if(next.approval.digest!==digest||next.approval.decision==="deny")throw new ControlError("WEB_POLICY_CHANGED","Web policy changed. No further access is permitted for this request.");}
}
