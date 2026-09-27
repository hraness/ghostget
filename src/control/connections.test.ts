import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth, loadAuthSnapshot, loadAuthSnapshotIfPresent, removeAuth, saveAuth } from "../auth";
import { manifestHash, parseRuntimeManifest } from "../model";
import { providerPluginRegistry as registry } from "../provider-plugins";
import { installManifest, loadInstalledManifestSnapshot } from "../storage";
import { connectionAccountRevision } from "./account-revision";
import { Connections } from "./connections";

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(now?:()=>number) {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-connections-")));chmodSync(root,0o700);roots.push(root);
  const environment={GHOSTGET_STATE_HOME:root};
  let probe:()=>Promise<string>=async()=>"12345";
  let lastSignal:AbortSignal|undefined;
  const testRegistry={...registry,requireSessionRoute:(site:Parameters<typeof registry.requireSessionRoute>[0])=>{
    const binding=registry.requireSessionRoute(site);return {...binding,subject:{...binding.subject,probe:async(_auth:unknown,options?:{signal?:AbortSignal})=>{lastSignal=options?.signal;return probe();}}};
  }};
  const opened:string[]=[];
  const connections=new Connections(environment,()=>testRegistry,async(_browser,_profile,url)=>{opened.push(url);},now);
  const begin=async(expectedRevision:string|null=null)=>{
    const result=await connections.begin({action:"connection.begin",id:"x-account",provider:"x-web",browser:"chrome",profile:"Default",expectedRevision});
    if(result.kind!=="connection")throw new Error("expected connection");return result.attemptId;
  };
  const existing=()=>{const auth=createAuth("x-account",{source:"chrome",profile:"Default",subject:"67890"});saveAuth(auth,environment);return loadAuthSnapshot(auth.id,environment);};
  const signal=()=>lastSignal;
  return {environment,connections,opened,begin,existing,setProbe:(next:()=>Promise<string>)=>{probe=next;},signal};
}

test("connection commits exact verified account and installs its absent bundled interface",async()=>{
  const f=fixture();const id=await f.begin();expect(f.opened).toEqual(["https://x.com/i/flow/login"]);
  expect(loadAuthSnapshotIfPresent("x-account",f.environment)).toBeNull();
  expect(await f.connections.verify(id)).toMatchObject({status:"verified",subject:"12345"});
  expect(()=>f.connections.commit(id,"99999")).toThrow("Verify the exact account");
  f.connections.commit(id,"12345");
  expect(loadAuthSnapshot("x-account",f.environment).auth.subject).toBe("12345");
  const adapter=loadInstalledManifestSnapshot("x-web",f.environment,registry);expect(adapter.result.ok).toBe(true);
  expect(()=>f.connections.commit(id,"12345")).toThrow("expired");f.connections.close();
});

test("failed re-verification invalidates the prior proof and cannot be committed",async()=>{
  const f=fixture();const id=await f.begin();await f.connections.verify(id);
  f.setProbe(async()=>{throw new Error("synthetic verifier failure");});
  await expect(f.connections.verify(id)).rejects.toThrow("verify again");
  // The attempt survives so the menu can offer Try again, but the cleared
  // subject still makes any commit impossible until another verify succeeds.
  expect(()=>f.connections.commit(id,"12345")).toThrow("Verify the exact account");
  expect(loadAuthSnapshotIfPresent("x-account",f.environment)).toBeNull();
  expect(loadInstalledManifestSnapshot("x-web",f.environment,registry).availability).toBe("absent");f.connections.close();
});

test("a failed verification can be retried, verified and committed in place",async()=>{
  const f=fixture();const id=await f.begin();
  f.setProbe(async()=>{throw new Error("synthetic verifier failure");});
  await expect(f.connections.verify(id)).rejects.toThrow("verify again");
  f.setProbe(async()=>"12345");
  expect(await f.connections.verify(id)).toMatchObject({status:"verified",subject:"12345"});
  f.connections.commit(id,"12345");
  expect(loadAuthSnapshot("x-account",f.environment).auth.subject).toBe("12345");f.connections.close();
});

test("a verification retry gets a fresh controller signal",async()=>{
  const f=fixture();const id=await f.begin();
  f.setProbe(async()=>{throw new Error("synthetic verifier failure");});
  await expect(f.connections.verify(id)).rejects.toThrow("verify again");
  const first=f.signal();expect(first).not.toBeUndefined();
  // The first probe's 60 s deadline may have aborted its controller; a retry
  // must probe with a new, live signal or it would fail before any work ran.
  f.setProbe(async()=>"67890");
  expect(await f.connections.verify(id)).toMatchObject({status:"verified",subject:"67890"});
  expect(f.signal()).not.toBe(first);expect(f.signal()!.aborted).toBe(false);
  f.connections.commit(id,"67890");f.connections.close();
});

test("reconnect preserves a user-edited installed adapter and invalidates the old account revision",async()=>{
  const f=fixture();const current=f.existing();
  const parsed=parseRuntimeManifest(JSON.parse(readFileSync(new URL("../assets/adapters/x/wrench-web-adapter.json",import.meta.url),"utf8")) as unknown,registry);
  if(!parsed.ok)throw new Error("invalid fixture");const customized={...parsed.value,displayName:"My X interface"};
  installManifest(customized,{force:false,environment:f.environment,registry});
  const revision=connectionAccountRevision(current,f.environment);const id=await f.begin(revision);await f.connections.verify(id);f.connections.commit(id,"12345");
  const installed=loadInstalledManifestSnapshot("x-web",f.environment,registry);if(!installed.result.ok)throw new Error("missing installed fixture");
  expect(manifestHash(installed.result.value)).toBe(manifestHash(customized));
  const updated=loadAuthSnapshot("x-account",f.environment);const freshRevision=connectionAccountRevision(updated,f.environment);expect(freshRevision).not.toBe(revision);
  expect(()=>f.connections.disconnect("x-account",revision)).toThrow("changed");
  f.connections.disconnect("x-account",freshRevision);expect(loadAuthSnapshotIfPresent("x-account",f.environment)).toBeNull();f.connections.close();
});

test("A-to-B-to-A account lifetimes reject stale reconnect and disconnect despite identical metadata",async()=>{
  const f=fixture();const current=f.existing();const revision=connectionAccountRevision(current,f.environment);
  const id=await f.begin(revision);await f.connections.verify(id);
  removeAuth(current.auth.id,f.environment);saveAuth(current.auth,f.environment);
  const recreated=loadAuthSnapshot(current.auth.id,f.environment);expect(recreated.contentSha256).toBe(current.contentSha256);
  expect(connectionAccountRevision(recreated,f.environment)).not.toBe(revision);
  expect(()=>f.connections.commit(id,"12345")).toThrow("changed");
  expect(()=>f.connections.disconnect(current.auth.id,revision)).toThrow("changed");
  expect(loadAuthSnapshot(current.auth.id,f.environment).auth.subject).toBe("67890");f.connections.close();
});

test("cancel during verification cannot resurrect a successful proof",async()=>{
  const f=fixture();let release:(subject:string)=>void=()=>undefined;const ready=new Promise<string>(resolve=>{release=resolve;});f.setProbe(()=>ready);
  const id=await f.begin();const pending=f.connections.verify(id);f.connections.cancel(id);release("12345");
  await expect(pending).rejects.toThrow("verify again");
  expect(()=>f.connections.commit(id,"12345")).toThrow("expired");expect(loadAuthSnapshotIfPresent("x-account",f.environment)).toBeNull();f.connections.close();
});

test("connection proof expires at the monotonic deadline before or during verification",async()=>{
  for(const phase of ["before-verify","during-verify","commit"] as const){
    let now=0;const f=fixture(()=>now);const id=await f.begin();
    if(phase==="during-verify"){
      let release:(subject:string)=>void=()=>undefined;
      const ready=new Promise<string>(resolve=>{release=resolve;});f.setProbe(()=>ready);
      const verifying=f.connections.verify(id);now=600_000;release("12345");
      await expect(verifying).rejects.toThrow("verify again");
    }else if(phase==="before-verify"){
      now=600_000;await expect(f.connections.verify(id)).rejects.toThrow("expired");
    }else{
      now=599_999;await f.connections.verify(id);now=600_000;
    }
    expect(()=>f.connections.commit(id,"12345")).toThrow("expired");
    expect(loadAuthSnapshotIfPresent("x-account",f.environment)).toBeNull();f.connections.close();
  }
});
