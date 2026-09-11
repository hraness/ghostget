import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAuth, loadAuthSnapshotIfPresent, removeAuth, replaceAuthIfUnchanged, saveAuth, type AuthSnapshot, type GhostgetAuth } from "../auth";
import type { ProviderPluginRegistry } from "../provider-plugin-registry";
import { withReadProjectionAuthAdmission } from "../read-projections";
import { installManifest, loadInstalledManifestSnapshot } from "../storage";
import { parseRuntimeManifest } from "../model";
import { connectionAccountRevision } from "./account-revision";
import type { ControlData, ControlRequest } from "./protocol";
import { ControlError } from "./validation";
import type { ControlEnvironment } from "./web-policy";

const PROVIDERS=[{id:"x-web",surface:"x",title:"X · browser session",login:"https://x.com/i/flow/login"},{id:"linkedin-web",surface:"linkedin",title:"LinkedIn · browser session",login:"https://www.linkedin.com/login"},{id:"reddit-web",surface:"reddit",title:"Reddit · browser session",login:"https://www.reddit.com/login/"}] as const;
type Begin=Extract<ControlRequest,{action:"connection.begin"}>;
type Attempt={readonly id:string;readonly request:Begin;readonly current:AuthSnapshot|null;readonly expiresAt:number;readonly controller:AbortController;auth:GhostgetAuth;subject:string|null;verifying:boolean};
export const connectionProviders=PROVIDERS.map(({id,title})=>({id,title}));
export class Connections {
  private readonly attempts=new Map<string,Attempt>();
  constructor(private readonly environment:ControlEnvironment,private readonly registry:()=>ProviderPluginRegistry,private readonly open:(browser:"chrome"|"safari",profile:string|null,url:string)=>Promise<void>=openBrowser,private readonly now:()=>number=()=>performance.now()) {}
  private sweep():void {for(const [id,a] of this.attempts)if(this.now()>=a.expiresAt){a.controller.abort();this.attempts.delete(id);}}
  async begin(request:Begin):Promise<ControlData> {
    this.sweep();if(this.attempts.size>=8)throw new ControlError("CONNECTION_LIMIT","Finish or cancel an existing connection first.");
    const provider=PROVIDERS.find(item=>item.id===request.provider);if(provider===undefined)throw new ControlError("CONNECTION_UNSUPPORTED","Use the provider's agent instructions to connect this account.");
    if(request.profile!==null && (request.browser!=="chrome" || !/^(?:Default|Profile [1-9][0-9]{0,2})$/u.test(request.profile)))throw new ControlError("PROFILE_UNSUPPORTED","Choose Default or a numbered Chrome profile.");
    const current=loadAuthSnapshotIfPresent(request.id,this.environment);
    if((current===null?null:connectionAccountRevision(current,this.environment))!==request.expectedRevision)throw new ControlError("ACCOUNT_CHANGED","The account changed. Refresh before reconnecting.");
    const auth=createAuth(request.id,{source:request.browser,...(request.profile===null?{}:{profile:request.profile})});
    const binding=this.registry().requireSessionRoute(provider.surface);
    if(!binding.authKinds.includes(auth.kind)||binding.subject.probe===undefined)throw new ControlError("CONNECTION_UNSUPPORTED","This provider has no compatible sign-in verifier.");
    const id=randomUUID();const attempt:Attempt={id,request,current,auth,subject:null,expiresAt:this.now()+600_000,controller:new AbortController(),verifying:false};
    this.attempts.set(id,attempt);
    try {await this.open(request.browser,request.profile,provider.login);}catch{this.attempts.delete(id);throw new ControlError("BROWSER_UNAVAILABLE","The selected browser could not be opened.");}
    return {kind:"connection",attemptId:id,status:"awaiting-sign-in",subject:null};
  }
  async verify(id:string):Promise<ControlData> {
    const attempt=this.get(id);if(attempt.verifying)throw new ControlError("CONNECTION_BUSY","Verification is already running.");
    // A failed re-verification cannot leave an older successful proof available to commit.
    attempt.subject=null;
    const {subject:_previousSubject,...unverifiedAuth}=attempt.auth;attempt.auth=unverifiedAuth;
    attempt.verifying=true;const timer=setTimeout(()=>attempt.controller.abort(),60_000);
    try {
      const provider=PROVIDERS.find(item=>item.id===attempt.request.provider)!;const binding=this.registry().requireSessionRoute(provider.surface);
      const subject=await binding.subject.probe!(attempt.auth,{environment:this.environment,signal:attempt.controller.signal});
      if(this.get(id)!==attempt||attempt.controller.signal.aborted||!binding.subject.matches(subject))throw new Error();
      attempt.subject=subject;attempt.auth={...attempt.auth,subject};
      return {kind:"connection",attemptId:id,status:"verified",subject};
    } catch {this.cancel(id);throw new ControlError("SIGN_IN_UNVERIFIED","Sign-in could not be verified. Complete it in the selected browser and profile, then start a fresh connection.");}
    finally {clearTimeout(timer);attempt.verifying=false;}
  }
  commit(id:string,subject:string):void {
    const attempt=this.get(id);if(attempt.verifying||attempt.subject===null||attempt.subject!==subject||attempt.controller.signal.aborted)throw new ControlError("SIGN_IN_UNVERIFIED","Verify the exact account before connecting it.");
    withReadProjectionAuthAdmission(attempt.request.id,this.environment,()=>{
      const current=loadAuthSnapshotIfPresent(attempt.request.id,this.environment);
      if((current===null?null:connectionAccountRevision(current,this.environment))!==attempt.request.expectedRevision)throw new ControlError("ACCOUNT_CHANGED","The account changed while sign-in was open. Start again.");
      this.installBundledAdapter(attempt.request.provider);
      if(attempt.current===null)saveAuth(attempt.auth,this.environment);
      else if(!replaceAuthIfUnchanged(attempt.current,attempt.auth,this.environment).replaced)throw new ControlError("ACCOUNT_CHANGED","The account changed while sign-in was open. Start again.");
    });
    this.cancel(id);
  }
  disconnect(id:string,expectedRevision:string):void {
    withReadProjectionAuthAdmission(id,this.environment,()=>{
      const current=loadAuthSnapshotIfPresent(id,this.environment);if(current===null||connectionAccountRevision(current,this.environment)!==expectedRevision)throw new ControlError("ACCOUNT_CHANGED","The account changed. Refresh before disconnecting.");
      removeAuth(id,this.environment);
    });
  }
  cancel(id:string):void {const attempt=this.attempts.get(id);attempt?.controller.abort();this.attempts.delete(id);}
  private get(id:string):Attempt {this.sweep();const attempt=this.attempts.get(id);if(attempt===undefined)throw new ControlError("CONNECTION_EXPIRED","This sign-in attempt expired. Start again.");return attempt;}
  close():void {for(const id of this.attempts.keys())this.cancel(id);}
  private installBundledAdapter(providerId:string):void {
    const provider=PROVIDERS.find(item=>item.id===providerId)!;
    const registry=this.registry();
    if(registry.resolveOwnedManifest(provider.id)!==undefined)return;
    const current=loadInstalledManifestSnapshot(provider.id,this.environment,registry);
    if(current.availability==="present"&&current.result.ok)return;
    if(current.availability!=="absent")throw new ControlError("ADAPTER_UNAVAILABLE","The existing adapter is invalid. Repair it before connecting; Ghostget will not overwrite it.");
    const parsed=parseRuntimeManifest(JSON.parse(readFileSync(new URL(`../assets/adapters/${provider.surface}/wrench-web-adapter.json`,import.meta.url),"utf8")) as unknown,registry);
    if(!parsed.ok||parsed.value.id!==provider.id)throw new ControlError("ADAPTER_UNAVAILABLE","The bundled provider interface is unavailable or invalid.");
    installManifest(parsed.value,{force:false,environment:this.environment,registry});
  }
}
async function openBrowser(browser:"chrome"|"safari",profile:string|null,url:string):Promise<void> {
  if(process.platform!=="darwin")throw new Error("macOS required");
  const args=browser==="safari"?["/usr/bin/open","-a","Safari",url]:profile===null?["/usr/bin/open","-a","Google Chrome",url]:["/usr/bin/open","-a","Google Chrome","--args",`--profile-directory=${profile}`,url];
  const child=Bun.spawn(args,{stdin:"ignore",stdout:"ignore",stderr:"ignore",env:{PATH:"/usr/bin:/bin",HOME:process.env.HOME??""}});
  const timer=setTimeout(()=>child.kill(),5000);try{if(await child.exited!==0)throw new Error("browser launch failed");}finally{clearTimeout(timer);}
}
