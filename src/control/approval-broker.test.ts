import { expect, test } from "bun:test";
import { assertAsyncProperty, fc } from "../test-support";
import type { AsyncCommand } from "../test-support";
import { ApprovalBroker } from "./approval-broker";
import type { ApprovalTarget, CheckedApproval } from "./protocol";
const target:ApprovalTarget={kind:"web",method:"GET",url:"https://docs.example.com/"};
const checked:CheckedApproval={digest:"a".repeat(64),revision:1,decision:"ask",kind:"web",title:"GET docs.example.com",account:null,effect:"retrieval",preview:"Bound exact URL"};
test("only private decision admits exact pending requests, once",async()=>{
  const broker=new ApprovalBroker(async()=>checked);
  expect((await broker.request("one",target,checked.digest)).status).toBe("pending");
  expect((await broker.check("one",checked.digest)).status).toBe("pending");
  await expect(broker.decide("one","b".repeat(64),"allow-once")).rejects.toThrow();
  await broker.decide("one",checked.digest,"allow-once");
  expect((await broker.check("one",checked.digest)).status).toBe("allowed");
  await expect(broker.decide("one",checked.digest,"allow-once")).rejects.toThrow();
  await expect(broker.request("one",target,checked.digest)).rejects.toThrow();
  broker.cancel("one",checked.digest);expect((await broker.check("one",checked.digest)).status).toBe("expired");
});
test("drift, expiry and shutdown revoke pending and admitted proofs",async()=>{
  let now=0;let current=checked;const broker=new ApprovalBroker(async()=>current,()=>now);
  await broker.request("one",target,checked.digest);current={...checked,digest:"b".repeat(64)};
  await expect(broker.decide("one",checked.digest,"allow-once")).rejects.toThrow();
  current=checked;await broker.request("two",target,checked.digest);now=120_000;
  await expect(broker.decide("two",checked.digest,"allow-once")).rejects.toThrow();
  await broker.request("three",target,checked.digest);await broker.decide("three",checked.digest,"allow-once");broker.close();
  expect((await broker.check("three",checked.digest)).status).toBe("expired");
});
test("admitted rechecks retain the original preview after a plan is consumed",async()=>{
  let initial=0;let rechecks=0;const broker=new ApprovalBroker(async()=>{initial++;return checked;},undefined,async(_target,retained)=>{expect(retained).toBe(checked);rechecks++;return retained;});
  await broker.request("one",target,checked.digest);await broker.decide("one",checked.digest,"allow-once");await broker.check("one",checked.digest);
  expect(initial).toBe(2);expect(rechecks).toBe(1);
});
test("queue admission remains bounded across concurrent preparations",async()=>{
  let unblock:()=>void=()=>undefined;const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  const broker=new ApprovalBroker(async()=>{await barrier;return checked;});
  const pending=Array.from({length:140},(_,index)=>broker.request(`request-${index}`,target,checked.digest));unblock();
  const results=await Promise.allSettled(pending);expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(128);expect(broker.list()).toHaveLength(128);
});
test("cancel and close cannot race an awaited admission check",async()=>{
  for(const action of ["cancel","close"] as const){
    let unblock:()=>void=()=>undefined;const barrier=new Promise<void>(resolve=>{unblock=resolve;});
    const broker=new ApprovalBroker(async()=>checked,undefined,async()=>{await barrier;return checked;});
    await broker.request("one",target,checked.digest);await broker.decide("one",checked.digest,"allow-once");
    const pending=broker.check("one",checked.digest);
    if(action==="cancel")broker.cancel("one",checked.digest);else broker.close();
    unblock();expect((await pending).status).toBe("expired");
  }
});
test("an awaited preparation cannot repopulate a closed broker",async()=>{
  let unblock:()=>void=()=>undefined;const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  const broker=new ApprovalBroker(async()=>{await barrier;return checked;});const pending=broker.request("one",target,checked.digest);
  broker.close();unblock();await expect(pending).rejects.toThrow();expect(broker.list()).toHaveLength(0);
});

test("wall-clock jumps cannot extend or prematurely expire pending or admitted proof",async()=>{
  for(const jump of [-86_400_000,86_400_000]){
    let monotonic=0;let wall=1_800_000_000_000;
    const broker=new ApprovalBroker(async()=>checked,()=>monotonic,async()=>checked,()=>wall);
    await broker.request("pending",target,checked.digest);
    expect(broker.list()[0]?.expiresAt).toBe(new Date(wall+120_000).toISOString());
    await broker.request("admitted",target,checked.digest);await broker.decide("admitted",checked.digest,"allow-once");
    wall+=jump;monotonic=119_999;const holder="1".repeat(64);
    expect((await broker.check("pending",checked.digest)).status).toBe("pending");
    expect((await broker.check("admitted",checked.digest,holder)).status).toBe("allowed");
    monotonic=120_000;expect((await broker.check("pending",checked.digest)).status).toBe("expired");
    monotonic=599_999;expect((await broker.check("admitted",checked.digest,holder)).status).toBe("allowed");
    monotonic=600_000;expect((await broker.check("admitted",checked.digest,holder)).status).toBe("expired");
    broker.close();
  }
});

test("async decisions and retained checks cannot cross their monotonic deadline",async()=>{
  for(const phase of ["decide","pending-check","admitted-check"] as const){
    let now=0;let pause=false;let unblock:()=>void=()=>undefined;
    const barrier=new Promise<void>(resolve=>{unblock=resolve;});
    const recompute=async()=>{if(pause)await barrier;return checked;};
    const broker=new ApprovalBroker(recompute,()=>now,recompute);
    await broker.request("one",target,checked.digest);
    if(phase==="admitted-check")await broker.decide("one",checked.digest,"allow-once");
    pause=true;
    if(phase==="decide"){
      const pending=broker.decide("one",checked.digest,"allow-once");
      now=120_000;unblock();await expect(pending).rejects.toThrow();
    }else{
      const pending=broker.check("one",checked.digest);
      now=phase==="admitted-check"?600_000:120_000;unblock();expect((await pending).status).toBe("expired");
    }
    expect((await broker.check("one",checked.digest)).status).toBe("expired");
    broker.close();
  }
});

test("concurrent previews stay below the aggregate escaped response byte budget",async()=>{
  let unblock:()=>void=()=>undefined;const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  const large={...checked,preview:"\u0001".repeat(20_000)};
  const broker=new ApprovalBroker(async()=>{await barrier;return large;});
  const pending=Array.from({length:16},(_,index)=>broker.request(`large-${index}`,target,large.digest));
  unblock();const results=await Promise.allSettled(pending);
  const accepted=results.flatMap((result,index)=>result.status==="fulfilled"?[`large-${index}`]:[]);
  expect(accepted).toHaveLength(4);
  expect(results.filter(result=>result.status==="rejected")).toHaveLength(12);
  expect(Buffer.byteLength(JSON.stringify(broker.list()))).toBeLessThanOrEqual(512*1024);
  for(const result of results)if(result.status==="rejected")expect(result.reason.code).toBe("APPROVAL_QUEUE_FULL");
  await broker.decide(accepted[0]!,large.digest,"allow-once");
  await expect(broker.request("still-retained",target,large.digest)).rejects.toThrow("preview-size limit");
  broker.cancel(accepted[0]!,large.digest);
  expect((await broker.request("released",target,large.digest)).status).toBe("pending");
  broker.close();expect(broker.list()).toHaveLength(0);
});

test("an allow-once grant admits one holder, so a crashed holder leaves no reusable lease",async()=>{
  const broker=new ApprovalBroker(async()=>checked);
  const holder="1".repeat(64);const successor="2".repeat(64);
  await broker.request("one",target,checked.digest);await broker.decide("one",checked.digest,"allow-once");
  expect((await broker.check("one",checked.digest,holder)).status).toBe("allowed");
  expect((await broker.check("one",checked.digest,holder)).status).toBe("allowed");
  // The holder crashes before releaseApproval. A same-UID caller that knows the lease still cannot use it.
  expect((await broker.check("one",checked.digest,successor)).status).toBe("expired");
  expect((await broker.check("one",checked.digest)).status).toBe("expired");
  expect(broker.cancel("one",checked.digest).status).toBe("cancelled");
  expect(broker.cancel("one",checked.digest).status).toBe("cancelled");
  expect((await broker.check("one",checked.digest,holder)).status).toBe("expired");
});

test("a request that carries a use secret admits no other caller, even before the holder's first check",async()=>{
  const broker=new ApprovalBroker(async()=>checked);
  const holder="1".repeat(64);const stranger="2".repeat(64);
  await broker.request("bound",target,checked.digest,holder);
  expect((await broker.check("bound",checked.digest,stranger)).status).toBe("expired");
  expect((await broker.check("bound",checked.digest,holder)).status).toBe("pending");
  await broker.decide("bound",checked.digest,"allow-once");
  // A caller that learned the id races the holder's first check after the decision.
  expect((await broker.check("bound",checked.digest,stranger)).status).toBe("expired");
  expect((await broker.check("bound",checked.digest)).status).toBe("expired");
  expect((await broker.check("bound",checked.digest,holder)).status).toBe("allowed");
  expect((await broker.check("bound",checked.digest,holder)).status).toBe("allowed");
  broker.close();
});

// One allow-once grant against processes that check, crash and restart, release, and wait.
// A check without a use secret is a distinct identity each time, like a caller that only knows the lease.
// A bound grant was requested with process 0's secret; an unbound one is claimed by its first allowed checker.
type GrantModel={holder:string|null|undefined;released:boolean;now:number;readonly identities:Set<string>};
type GrantReal={readonly broker:ApprovalBroker;readonly tokens:string[];clock:{now:number};anonymous:number};
const grantDeadline=600_000;
const expectedCheck=(m:GrantModel,token:string|undefined):"allowed"|"expired"=>{
  if(m.released||m.now>=grantDeadline)return "expired";
  if(m.holder===undefined){m.holder=token??null;return "allowed";}
  return token!==undefined&&m.holder===token?"allowed":"expired";
};
const record=(m:GrantModel,r:GrantReal,status:string,token:string|undefined):void=>{
  if(status==="allowed")m.identities.add(token??`anonymous-${r.anonymous++}`);
  expect(m.identities.size).toBeLessThanOrEqual(1);
};
class CheckCommand implements AsyncCommand<GrantModel,GrantReal> {
  constructor(readonly process:number,readonly withUse:boolean) {}
  check():boolean {return true;}
  async run(m:GrantModel,r:GrantReal):Promise<void> {
    const token=this.withUse?r.tokens[this.process]:undefined;
    const status=(await r.broker.check("grant",checked.digest,token)).status;
    expect(status).toBe(expectedCheck(m,token));record(m,r,status,token);
  }
  toString():string {return `check(${this.process},${this.withUse})`;}
}
class RaceCommand implements AsyncCommand<GrantModel,GrantReal> {
  constructor(readonly first:number,readonly second:number) {}
  check():boolean {return true;}
  async run(m:GrantModel,r:GrantReal):Promise<void> {
    const tokens=[r.tokens[this.first]!,r.tokens[this.second]!];
    const results=await Promise.all(tokens.map(token=>r.broker.check("grant",checked.digest,token)));
    // Both checks await the recheck, so the first to resume claims an unclaimed grant.
    results.forEach((result,index)=>{expect(result.status).toBe(expectedCheck(m,tokens[index]));record(m,r,result.status,tokens[index]);});
  }
  toString():string {return `race(${this.first},${this.second})`;}
}
class CrashCommand implements AsyncCommand<GrantModel,GrantReal> {
  constructor(readonly process:number) {}
  check():boolean {return true;}
  async run(_m:GrantModel,r:GrantReal):Promise<void> {r.tokens[this.process]=crypto.getRandomValues(new Uint8Array(32)).reduce((hex,byte)=>hex+byte.toString(16).padStart(2,"0"),"");}
  toString():string {return `crash(${this.process})`;}
}
class ReleaseCommand implements AsyncCommand<GrantModel,GrantReal> {
  check():boolean {return true;}
  async run(m:GrantModel,r:GrantReal):Promise<void> {expect(r.broker.cancel("grant",checked.digest).status).toBe("cancelled");m.released=true;}
  toString():string {return "release";}
}
class ExpireCommand implements AsyncCommand<GrantModel,GrantReal> {
  constructor(readonly elapsed:number) {}
  check():boolean {return true;}
  async run(m:GrantModel,r:GrantReal):Promise<void> {m.now+=this.elapsed;r.clock.now=m.now;}
  toString():string {return `expire(${this.elapsed})`;}
}
test("property: an allow-once grant, bound at request or at first check, admits at most one use across checks, races, crashes, release and expiry",async()=>{
  const processes=3;const process=fc.nat({max:processes-1});
  await assertAsyncProperty(fc.asyncProperty(fc.commands([
    fc.tuple(process,fc.boolean()).map(([index,withUse])=>new CheckCommand(index,withUse)),
    fc.tuple(process,process).map(([first,second])=>new RaceCommand(first,second)),
    process.map(index=>new CrashCommand(index)),
    fc.constant(new ReleaseCommand()),
    fc.integer({min:1,max:300_000}).map(elapsed=>new ExpireCommand(elapsed)),
  ],{maxCommands:24}),fc.boolean(),async(commands,bound)=>{
    const clock={now:0};
    const broker=new ApprovalBroker(async()=>checked,()=>clock.now,async(_target,retained)=>{await Promise.resolve();return retained;});
    const tokens=Array.from({length:processes},(_,index)=>String(index+1).repeat(64));
    await broker.request("grant",target,checked.digest,bound?tokens[0]:undefined);await broker.decide("grant",checked.digest,"allow-once");
    await fc.asyncModelRun(()=>({model:{holder:bound?tokens[0]:undefined,released:false,now:0,identities:new Set<string>()},real:{broker,tokens,clock,anonymous:0}}),commands);
    broker.close();
  }));
});
