import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { controlResponseLine, parseActivityQuery, parseControlRequest, parseWebRule, publicUrl } from "./validation";
export const testWebRule={id:"docs",origin:"https://docs.example.com",path:{kind:"prefix" as const,value:"/guide/"},methods:["GET" as const],queryKeys:["q"],decision:"allow" as const,effect:"retrieval" as const,maxResponseBytes:1024,timeoutMs:1000};
export const testActivityQuery={search:"",method:"all" as const,outcome:"all" as const,origin:null,since:null,order:"newest" as const,cursor:null,limit:100};
describe("control protocol boundaries",()=>{
  test("oversized responses become a bounded matching error without losing the next request",()=>{
    const empty={ok:true as const,data:{kind:"prompt" as const,text:""}};
    const overhead=Buffer.byteLength(controlResponseLine("boundary",empty));
    const exact=controlResponseLine("boundary",{...empty,data:{...empty.data,text:"a".repeat(4_194_304-overhead)}});
    expect(Buffer.byteLength(exact)).toBe(4_194_304);
    expect(JSON.parse(exact).ok).toBe(true);
    for(const text of ["a".repeat(4_194_305-overhead),"🍂".repeat(1_048_577),"\n".repeat(2_097_153)]) {
      const line=controlResponseLine("boundary",{...empty,data:{...empty.data,text}});
      expect(Buffer.byteLength(line)).toBeLessThan(1024);
      expect(JSON.parse(line)).toMatchObject({id:"boundary",protocol:"ghostget.control/1",ok:false,code:"CONTROL_RESPONSE_TOO_LARGE"});
      expect(JSON.parse(controlResponseLine("next",{ok:true,data:{kind:"approvals",approvals:[]}}))).toEqual({id:"next",protocol:"ghostget.control/1",ok:true,data:{kind:"approvals",approvals:[]}});
    }
  });
  test("rejects unknown administrative fields and unsupported methods",()=>{
    expect(parseControlRequest({action:"snapshot",accountId:null})).toEqual({action:"snapshot",accountId:null});
    expect(parseControlRequest({action:"approval.list"})).toEqual({action:"approval.list"});
    expect(()=>parseControlRequest({action:"approval.list",accountId:null})).toThrow();
    expect(()=>parseControlRequest({action:"snapshot",accountId:null,approve:true})).toThrow();
    expect(()=>parseWebRule({...testWebRule,methods:["POST"]})).toThrow();
    expect(()=>parseWebRule({...testWebRule,headers:{authorization:"hidden"}})).toThrow();
    expect(()=>parseWebRule({...testWebRule,path:{kind:"prefix",value:"/guide"}})).toThrow();
  });
  test("rejects URL normalization, authority and query ambiguity",()=>{
    for(const url of ["http://docs.example.com/","https://127.0.0.1/","https://[::1]/","https://u:p@docs.example.com/","https://docs.example.com:443/","https://docs.example.com./","https://docs.example.com/a/../b","https://docs.example.com/%2e%2e/","https://docs.example.com/%252f","https://docs.example.com/a\\b","https://docs.example.com/?a=1&a=2","https://docs.example.com/#secret","https://something.local/"]){expect(()=>publicUrl(url)).toThrow();}
    expect(publicUrl("https://docs.example.com/guide/a?q=hello").hostname).toBe("docs.example.com");
    for(const path of ["/%61dmin","/admin;ignored","//admin"])expect(()=>publicUrl(`https://docs.example.com${path}`)).toThrow();
  });
  test("strict parsers reject every generated unknown key",()=>{
    fc.assert(fc.property(fc.string({minLength:1,maxLength:40}).filter(key=>!Object.hasOwn(testWebRule,key)),key=>{expect(()=>parseWebRule({...testWebRule,[key]:true})).toThrow();}),{numRuns:200});
    fc.assert(fc.property(fc.integer({min:101,max:1_000_000}),limit=>{expect(()=>parseActivityQuery({...testActivityQuery,limit})).toThrow();}),{numRuns:100});
  });
  test("valid bounded rule roundtrips preserve effect and policy",()=>{
    fc.assert(fc.property(fc.constantFrom("allow","deny","ask"),fc.integer({min:1,max:2_000_000}),fc.integer({min:1000,max:60_000}),(decision,maxResponseBytes,timeoutMs)=>{const rule={...testWebRule,decision,maxResponseBytes,timeoutMs};expect(parseWebRule(JSON.parse(JSON.stringify(rule)))).toEqual(rule);}),{numRuns:200});
  });
});
