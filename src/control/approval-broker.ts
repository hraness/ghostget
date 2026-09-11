import type { AgentApprovalResponse, ApprovalTarget, ApprovalView, CheckedApproval } from "./protocol";
import { ControlError } from "./validation";

type Entry={readonly id:string;readonly target:ApprovalTarget;readonly checked:CheckedApproval;readonly viewBytes:number;expiresAt:number;expiresAtWall:number;status:AgentApprovalResponse["status"]};
const MAX_APPROVAL_VIEW_BYTES=512*1024;
function view(id:string,checked:CheckedApproval,expiresAtWall:number):ApprovalView{return {id,digest:checked.digest,kind:checked.kind,title:checked.title,account:checked.account,effect:checked.effect,preview:checked.preview,expiresAt:new Date(expiresAtWall).toISOString()};}
/** Only the private native control channel receives a reference to decide(). */
export class ApprovalBroker {
  private readonly entries=new Map<string,Entry>();
  private closed=false;
  constructor(private readonly recompute:(target:ApprovalTarget)=>Promise<CheckedApproval>,private readonly now:()=>number=()=>performance.now(),private readonly recheck:(target:ApprovalTarget,checked:CheckedApproval)=>Promise<CheckedApproval>=target=>recompute(target),private readonly wallNow:()=>number=Date.now) {}
  private sweep():void {for(const [id,e] of this.entries) if(this.now()>=e.expiresAt) this.entries.delete(id);}
  async request(id:string,target:ApprovalTarget,expectedDigest:string):Promise<AgentApprovalResponse> {
    if(this.closed)throw new ControlError("CONTROL_CLOSED","The control service is closing.");
    this.sweep();
    if(this.entries.has(id)) throw new ControlError("APPROVAL_REPLAY","An approval request identifier cannot be reused.");
    if(this.entries.size>=128) throw new ControlError("APPROVAL_QUEUE_FULL","The approval queue is full.");
    const checked=await this.recompute(target);
    if(checked.digest!==expectedDigest || checked.decision!=="ask") return {protocol:"ghostget.approval/1",id,digest:expectedDigest,status:"invalid"};
    // Recheck the bound after asynchronous preparation; concurrent requests cannot overfill it.
    if(this.closed)throw new ControlError("CONTROL_CLOSED","The control service is closing.");
    if(this.entries.size>=128 || this.entries.has(id)) throw new ControlError("APPROVAL_QUEUE_FULL","The approval queue is full.");
    const now=this.now();const expiresAtWall=this.wallNow()+120_000;
    const viewBytes=Buffer.byteLength(JSON.stringify(view(id,checked,expiresAtWall)))+1;
    const retainedBytes=[...this.entries.values()].reduce((total,entry)=>total+entry.viewBytes,2);
    if(retainedBytes+viewBytes>MAX_APPROVAL_VIEW_BYTES)throw new ControlError("APPROVAL_QUEUE_FULL","The approval queue has reached its preview-size limit. Finish an existing request before retrying.");
    this.entries.set(id,{id,target,checked,viewBytes,expiresAt:now+120_000,expiresAtWall,status:"pending"});
    return {protocol:"ghostget.approval/1",id,digest:expectedDigest,status:"pending"};
  }
  async check(id:string,digest:string):Promise<AgentApprovalResponse> {
    this.sweep();const e=this.entries.get(id);
    let status:AgentApprovalResponse["status"]="expired";
    if(e!==undefined&&e.checked.digest===digest) {
      if(e.status==="allowed"||e.status==="pending") {
        const checked=e.status==="allowed" ? await this.recheck(e.target,e.checked) : await this.recompute(e.target);
        if(this.closed||this.entries.get(id)!==e||this.now()>=e.expiresAt)return {protocol:"ghostget.approval/1",id,digest,status:"expired"};
        if(checked.digest!==digest||checked.decision!=="ask") e.status="invalid";
      }
      status=e.status;
    }
    return {protocol:"ghostget.approval/1",id,digest,status};
  }
  async decide(id:string,digest:string,decision:"allow-once"|"deny"):Promise<void> {
    this.sweep();const e=this.entries.get(id);
    if(e===undefined||e.checked.digest!==digest||e.status!=="pending") throw new ControlError("APPROVAL_STALE","This request is no longer awaiting approval.");
    if(decision==="deny") {e.status="denied";return;}
    const checked=await this.recompute(e.target);
    if(this.closed||this.entries.get(id)!==e||e.status!=="pending"||this.now()>=e.expiresAt||checked.digest!==digest||checked.decision!=="ask") throw new ControlError("APPROVAL_STALE","The request or its policy changed. The agent must request approval again.");
    e.status="allowed";e.expiresAt=this.now()+600_000;e.expiresAtWall=this.wallNow()+600_000;
  }
  cancel(id:string,digest:string):AgentApprovalResponse {
    const e=this.entries.get(id);if(e?.checked.digest===digest)this.entries.delete(id);
    return {protocol:"ghostget.approval/1",id,digest,status:"cancelled"};
  }
  list():readonly ApprovalView[] {
    this.sweep();return [...this.entries.values()].filter(e=>e.status==="pending").map(e=>view(e.id,e.checked,e.expiresAtWall));
  }
  close():void {this.closed=true;this.entries.clear();}
}
