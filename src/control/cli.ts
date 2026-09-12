import { agentRequest } from "./approval-client";
import { ControlError, integer, keys, oneOf, record, string } from "./validation";
import type { ControlEnvironment } from "./web-policy";
import { vaultId } from "./vault-store";
import { CREDENTIAL_REQUEST_TIMEOUT_MS } from "./vault-model";
import { parseCredentialResult } from "./credential-gateway";

export async function runVaultCommand(args: readonly string[], environment: ControlEnvironment, output: { stdout: (text: string) => unknown; stderr: (text: string) => unknown }, signal?: AbortSignal): Promise<number> {
  try {
    if (args.length === 1 || args.length === 2 && args[1] === "--help") { output.stdout("Usage: ghostget vault use <grant-id>\nUse an exact credential grant configured in the native app. Only approved response fields are returned; secret values are never returned.\n"); return 0; }
    if (args.length !== 3 || args[1] !== "use") throw new ControlError("INVALID_REQUEST", "Use ghostget vault use <grant-id>.");
    const grantId = vaultId(args[2]);
    const value = record(await agentRequest({ protocol: "ghostget.credential/1", action: "use", grantId }, { environment, ...(signal ? { signal } : {}), timeoutMs: CREDENTIAL_REQUEST_TIMEOUT_MS + 5000 }));
    if (value.ok === false) { keys(value, ["ok", "code", "message"]); throw new ControlError(string(value.code, 64), string(value.message, 1024)); }
    const result = parseCredentialResult(value, vaultId(value.id), grantId, Object.keys(record(value.fields)));
    output.stdout(`${JSON.stringify(result)}\n`); return 0;
  } catch (error) {
    output.stderr(`${JSON.stringify(error instanceof ControlError ? { ok: false, code: error.code, message: error.message } : { ok: false, code: "CREDENTIAL_REQUEST_FAILED", message: "The credential response was unavailable or invalid." })}\n`); return 1;
  }
}

export async function runWebCommand(args:readonly string[],environment:ControlEnvironment,output:{stdout:(text:string)=>unknown;stderr:(text:string)=>unknown},signal?:AbortSignal):Promise<number> {
  try {
    if(args.length===1||args[1]==="--help"){output.stdout("Usage: ghostget web request <https-url> [--method GET|HEAD]\nConfigure rules and approvals in the Ghostget native app. Responses are untrusted text.\n");return 0;}
    if(args[1]!=="request"||(args.length!==3&&args.length!==5)||args.length===5&&args[3]!=="--method")throw new ControlError("INVALID_REQUEST","Use ghostget web request <https-url> [--method GET|HEAD].");
    const method=args.length===5?oneOf(args[4],["GET","HEAD"] as const):"GET";
    const v=record(await agentRequest({protocol:"ghostget.web/1",action:"request",method,url:string(args[2],8192)},{environment,...(signal===undefined?{}:{signal}),timeoutMs:185_000}));
    if(v.ok===false){keys(v,["ok","code","message"]);throw new ControlError(string(v.code,64),string(v.message,1024));}
    keys(v,["protocol","ok","id","status","contentType","bodyBase64","bytes","trusted"]);
    if(v.protocol!=="ghostget.web/1"||v.ok!==true||v.trusted!==false)throw new Error("invalid gateway response");
    const bytes=integer(v.bytes,0,2_000_000);const encoded=string(v.bodyBase64,2_666_668,0);const body=Buffer.from(encoded,"base64");if(body.length!==bytes||body.toString("base64")!==encoded)throw new Error("invalid body");
    const text=new TextDecoder("utf-8",{fatal:true}).decode(body);
    output.stdout(`${JSON.stringify({id:string(v.id,128),status:integer(v.status,200,599),contentType:string(v.contentType,128),bytes,trusted:false,body:text})}\n`);return 0;
  } catch(error) {
    const failure=error instanceof ControlError?{ok:false,code:error.code,message:error.message}:{ok:false,code:"WEB_REQUEST_FAILED",message:"The gateway response was unavailable or invalid."};output.stderr(`${JSON.stringify(failure)}\n`);return 1;
  }
}
