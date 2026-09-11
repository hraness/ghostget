import { afterEach, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ActivityStore } from "./activity";
import { ApprovalBroker } from "./approval-broker";
import { WebGateway } from "./web-gateway";
import { assertGatewayCommandAllowed, checkWebRequest, readWebPolicy, saveWebPolicy } from "./web-policy";
const rule={id:"docs",origin:"https://docs.example.com",path:{kind:"prefix" as const,value:"/guide/"},methods:["GET" as const],queryKeys:["q"],decision:"allow" as const,effect:"retrieval" as const,maxResponseBytes:1024,timeoutMs:1000};
const query={search:"",method:"all" as const,outcome:"all" as const,origin:null,since:null,order:"newest" as const,cursor:null,limit:100};
const cleanups:(()=>void)[]=[];afterEach(()=>{for(const cleanup of cleanups.splice(0).reverse())cleanup();});
function fixture(){const root=mkdtempSync(join(tmpdir(),"gg-control-"));const environment={...process.env,GHOSTGET_STATE_HOME:join(root,"state"),WRENCH_STATE_HOME:undefined,OH_STATE_HOME:undefined,IO_HOME:undefined};cleanups.push(()=>rmSync(root,{recursive:true,force:true}));const activity=new ActivityStore(environment);cleanups.push(()=>activity.close());const approvals=new ApprovalBroker(async target=>{if(target.kind!=="web")throw new Error();return checkWebRequest(target.method,target.url,environment).approval;});return {environment,activity,approvals};}
test("rules default deny, narrow queries, and deny dominates overlapping allows",()=>{
  const {environment}=fixture();expect(readWebPolicy(environment).revision).toBe(0);
  expect(checkWebRequest("GET","https://docs.example.com/guide/one",environment).approval.decision).toBe("deny");
  saveWebPolicy([rule],true,0,environment);
  expect(checkWebRequest("GET","https://docs.example.com/guide/one?q=a",environment).approval.decision).toBe("allow");
  expect(checkWebRequest("GET","https://docs.example.com/guide/one?secret=a",environment).approval.decision).toBe("deny");
  expect(()=>assertGatewayCommandAllowed(["url-metadata","https://docs.example.com/"],environment)).toThrow();
  expect(()=>assertGatewayCommandAllowed(["web","request"],environment)).not.toThrow();
  saveWebPolicy([rule,{...rule,id:"blocked",decision:"deny",path:{kind:"exact",value:"/guide/one"},queryKeys:[]}],true,1,environment);
  expect(checkWebRequest("GET","https://docs.example.com/guide/one?q=a",environment).approval.decision).toBe("deny");
  expect(()=>saveWebPolicy([],false,1,environment)).toThrow();
  saveWebPolicy([{...rule,path:{kind:"prefix",value:"/"}},{...rule,id:"admin",decision:"deny",path:{kind:"exact",value:"/admin"}}],true,2,environment);
  expect(checkWebRequest("GET","https://docs.example.com/admin",environment).approval.decision).toBe("deny");
  expect(()=>checkWebRequest("GET","https://docs.example.com/%61dmin",environment)).toThrow();
});
test("durable history precedes network, never contains query values or response bodies",async()=>{
  const {environment,activity,approvals}=fixture();saveWebPolicy([rule],false,0,environment);let calls=0;
  const gateway=new WebGateway(activity,approvals,environment,async(_url,init)=>{calls++;expect(activity.query(query).rows[0]?.outcome).toBe("started");expect(new Headers(init.headers).has("authorization")).toBe(false);expect(init.redirect).toBe("error");return new Response("private response body",{headers:{"content-type":"text/plain"}});});
  const result=await gateway.run("GET","https://docs.example.com/guide/one?q=private-query-value",new AbortController().signal);
  expect(result.bytes).toBe(21);expect(calls).toBe(1);const rows=activity.query(query).rows;expect(rows[0]?.outcome).toBe("succeeded");
  const bytes=readFileSync(join(environment.GHOSTGET_STATE_HOME,"control","activity","requests.sqlite"));expect(bytes.includes(Buffer.from("private-query-value"))).toBe(false);expect(bytes.includes(Buffer.from("private response body"))).toBe(false);
  activity.close();await expect(gateway.run("GET","https://docs.example.com/guide/one",new AbortController().signal)).rejects.toThrow();expect(calls).toBe(1);
});
test("revocation, redirect, oversized body and failed final audit withhold output",async()=>{
  const {environment,activity,approvals}=fixture();saveWebPolicy([rule],false,0,environment);
  const run=(transport:ConstructorParameters<typeof WebGateway>[3])=>new WebGateway(activity,approvals,environment,transport).run("GET","https://docs.example.com/guide/one",new AbortController().signal);
  await expect(run(async()=>new Response(null,{status:302,headers:{location:"https://elsewhere.example.com/"}}))).rejects.toThrow();
  await expect(run(async()=>new Response("a".repeat(1025),{headers:{"content-type":"text/plain"}}))).rejects.toThrow();
  await expect(run(async()=>{saveWebPolicy([{...rule,decision:"deny"}],false,1,environment);return new Response("secret",{headers:{"content-type":"text/plain"}});})).rejects.toThrow();
  saveWebPolicy([rule],false,2,environment);const finish=spyOn(activity,"finish").mockImplementation(()=>{throw new Error("disk full");});
  await expect(run(async()=>new Response("secret",{headers:{"content-type":"text/plain"}}))).rejects.toMatchObject({code:"ACTIVITY_COMMIT_FAILED"});finish.mockRestore();
});
test("ten thousand rows use stable keyset traversal and escaped searches",()=>{
  const {environment,activity}=fixture();const db=new Database(join(environment.GHOSTGET_STATE_HOME,"control","activity","requests.sqlite"));
  const insert=db.query("INSERT INTO requests(id,started_at,method,origin,rule_id,decision,outcome) VALUES(?,?,'GET','https://docs.example.com',?,'allow','succeeded')");db.transaction(()=>{for(let i=0;i<10_000;i++)insert.run(`r-${i}`,"2026-09-11T00:00:00.000Z",i%2?"odd":"even");})();db.close();
  let page=activity.query(query);expect(page.matchingCount).toBe(10_000);const firstCursor=page.nextCursor!;const seen=new Set(page.rows.map(row=>row.sequence));let previous=page.rows.at(-1)!.sequence;
  for(let i=0;i<4;i++){page=activity.query({...query,cursor:page.nextCursor});for(const row of page.rows){expect(row.sequence).toBeLessThan(previous);expect(seen.has(row.sequence)).toBe(false);seen.add(row.sequence);previous=row.sequence;}}
  expect(activity.query({...query,search:"%"}).rows).toHaveLength(0);
  expect(()=>activity.query({...query,search:"odd",cursor:firstCursor})).toThrow();
  expect(()=>activity.query({...query,cursor:firstCursor.slice(0,-1)+"x"})).toThrow();
  activity.start({id:"new",method:"GET",origin:rule.origin,ruleId:"docs",endpoint:"/guide/",decision:"allow"});const continued=activity.query({...query,cursor:firstCursor});expect(continued.newerCount).toBe(1);expect(continued.rows.some(row=>row.id==="new")).toBe(false);
});
test("crash recovery preserves unknown requests without retrying",()=>{
  const {environment,activity}=fixture();activity.start({id:"interrupted",method:"GET",origin:rule.origin,ruleId:"docs",endpoint:"/guide/",decision:"allow"});activity.close();const recovered=new ActivityStore(environment);cleanups.push(()=>recovered.close());expect(recovered.query(query).rows[0]).toMatchObject({id:"interrupted",outcome:"interrupted",errorCode:"PROCESS_INTERRUPTED"});
});
test("a policy change while DNS is pending prevents HTTP dispatch",async()=>{
  const {environment,activity,approvals}=fixture();saveWebPolicy([rule],false,0,environment);let dispatched=false;
  const gateway=new WebGateway(activity,approvals,environment,async(_url,_init,_timeout,beforeRequest)=>{
    // The pinned transport invokes this callback after DNS and before opening its request.
    await Promise.resolve();saveWebPolicy([{...rule,decision:"deny"}],false,1,environment);beforeRequest();dispatched=true;
    return new Response("unreachable",{headers:{"content-type":"text/plain"}});
  });
  await expect(gateway.run("GET","https://docs.example.com/guide/one",new AbortController().signal)).rejects.toMatchObject({code:"WEB_POLICY_CHANGED"});expect(dispatched).toBe(false);
});
test("elapsed duration stays monotonic when the wall clock moves backwards",()=>{
  const root=mkdtempSync(join(tmpdir(),"gg-clock-"));cleanups.push(()=>rmSync(root,{recursive:true,force:true}));
  const environment={...process.env,GHOSTGET_STATE_HOME:join(root,"state"),WRENCH_STATE_HOME:undefined,OH_STATE_HOME:undefined,IO_HOME:undefined};
  let wall=Date.parse("2026-09-11T00:00:00.000Z");let monotonic=100;
  const activity=new ActivityStore(environment,()=>wall,()=>monotonic);cleanups.push(()=>activity.close());
  activity.start({id:"clock",method:"GET",origin:rule.origin,ruleId:"docs",endpoint:"/guide/",decision:"allow"});wall-=3600_000;monotonic+=432;
  activity.finish("clock",{outcome:"succeeded",httpStatus:200,responseBytes:0,errorCode:null});expect(activity.query(query).rows[0]?.durationMs).toBe(432);
});
test("retention preserves active work and prunes completed metadata at completion without later traffic",()=>{
  const root=mkdtempSync(join(tmpdir(),"gg-retention-"));cleanups.push(()=>rmSync(root,{recursive:true,force:true}));
  const environment={...process.env,GHOSTGET_STATE_HOME:join(root,"state"),WRENCH_STATE_HOME:undefined,OH_STATE_HOME:undefined,IO_HOME:undefined};
  let wall=Date.parse("2026-08-11T00:00:00.000Z");
  const activity=new ActivityStore(environment,()=>wall);cleanups.push(()=>activity.close());
  activity.start({id:"old-active",method:"GET",origin:rule.origin,ruleId:"docs",endpoint:"/guide/",decision:"allow"});
  wall=Date.parse("2026-09-11T00:00:00.000Z");
  const db=new Database(join(environment.GHOSTGET_STATE_HOME,"control","activity","requests.sqlite"));cleanups.push(()=>db.close());
  const insert=db.query("INSERT INTO requests(id,started_at,method,origin,rule_id,decision,outcome) VALUES(?,?,'GET','https://docs.example.com','docs','allow','succeeded')");
  db.transaction(()=>{insert.run("old-completed","2026-08-11T00:00:00.000Z");for(let i=0;i<10_001;i++)insert.run(`complete-${i}`,new Date(wall).toISOString());})();
  activity.start({id:"current-active",method:"GET",origin:rule.origin,ruleId:"docs",endpoint:"/guide/",decision:"allow"});
  const count=(outcome:string)=>db.query<{n:number},[string]>("SELECT COUNT(*) AS n FROM requests WHERE outcome=?").get(outcome)!.n;
  expect(count("succeeded")).toBe(10_000);expect(count("started")).toBe(2);
  expect(db.query("SELECT id FROM requests WHERE id='old-completed'").get()).toBeNull();
  activity.finish("current-active",{outcome:"succeeded",httpStatus:200,responseBytes:0,errorCode:null});
  expect(count("succeeded")).toBe(10_000);expect(count("started")).toBe(1);
  expect(db.query("SELECT id FROM requests WHERE id='complete-1'").get()).toBeNull();
  activity.finish("old-active",{outcome:"cancelled",httpStatus:null,responseBytes:0,errorCode:"REQUEST_CANCELLED"});
  expect(count("started")).toBe(0);expect(count("succeeded")).toBe(10_000);
  expect(db.query("SELECT id FROM requests WHERE id='old-active'").get()).toBeNull();
});
