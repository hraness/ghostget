import { expect, test } from "bun:test";
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
    wall+=jump;monotonic=119_999;
    expect((await broker.check("pending",checked.digest)).status).toBe("pending");
    expect((await broker.check("admitted",checked.digest)).status).toBe("allowed");
    monotonic=120_000;expect((await broker.check("pending",checked.digest)).status).toBe("expired");
    monotonic=599_999;expect((await broker.check("admitted",checked.digest)).status).toBe("allowed");
    monotonic=600_000;expect((await broker.check("admitted",checked.digest)).status).toBe("expired");
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
