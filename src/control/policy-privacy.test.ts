import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enableOperationPermissions, readOperationPolicy, setOperationPolicyEntry } from "../operation-permission-store";
import { ghostgetStateHome, readRegularFile } from "../storage";
import { assertGatewayCommandAllowed, readWebPolicy, saveWebPolicy } from "./web-policy";

test("policy root failures stay blocked and path-free before private file reads", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-private-policy-canary-")));
  chmodSync(root,0o700);
  try {
    const file=join(root,"private-file-canary");writeFileSync(file,"preserve",{mode:0o600});
    const nonprivate=join(root,"private-mode-canary");mkdirSync(nonprivate,{mode:0o755});chmodSync(nonprivate,0o755);
    const link=join(root,"private-link-canary");symlinkSync(nonprivate,link);
    const originalEntries=readdirSync(root).sort();
    const environments=[
      {GHOSTGET_STATE_HOME:file},
      {GHOSTGET_STATE_HOME:nonprivate},
      {GHOSTGET_STATE_HOME:link},
      {GHOSTGET_STATE_HOME:file,WRENCH_STATE_HOME:nonprivate},
    ];
    for(const environment of environments)for(const [read,code,message] of [
      [readWebPolicy,"WEB_POLICY_UNAVAILABLE","Web policy is missing, unsafe, or invalid. Requests are blocked."],
      [readOperationPolicy,"OPERATION_POLICY_INVALID","Operation permission state is missing or invalid; execution is blocked until it is repaired."],
    ] as const){
      let failure:unknown;
      try{read(environment);}catch(error){failure=error;}
      expect(failure).toBeInstanceOf(Error);
      if(!(failure instanceof Error)||!("code" in failure))throw new Error("Expected a categorical policy failure");
      expect(failure.code).toBe(code);expect(failure.message).toBe(message);
      expect(failure.message).not.toContain(root);expect(failure.message).not.toContain("canary");
    }
    expect(readFileSync(file,"utf8")).toBe("preserve");
    expect(statSync(nonprivate).mode&0o777).toBe(0o755);
    expect(readdirSync(nonprivate)).toEqual([]);
    expect(readdirSync(root).sort()).toEqual(originalEntries);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("absent policies neither create nor register state before local file inputs", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-passive-policy-")));
  try {
    for(const directory of [root,join(root,"not-created")]) {
      const environment={GHOSTGET_STATE_HOME:directory};
      expect(readWebPolicy(environment)).toMatchObject({revision:0,gatewayOnly:false});
      expect(readOperationPolicy(environment)).toMatchObject({managed:false,revision:0});
      expect(readdirSync(root)).toEqual([]);
      if(directory!==root) {expect(existsSync(directory)).toBe(false);mkdirSync(directory,{mode:0o700});}
      const input=join(directory,"thread.txt");
      writeFileSync(input,"local file input",{mode:0o600});
      // Registration alone changes readRegularFile into a state-helper read,
      // which intentionally forbids root-level files. Absence must be passive.
      expect(readRegularFile(input,1024)).toBe("local file input");
      expect(readWebPolicy(environment).revision).toBe(0);
      expect(readOperationPolicy(environment).managed).toBe(false);
      expect(readRegularFile(input,1024)).toBe("local file input");
      expect(readdirSync(directory)).toEqual(["thread.txt"]);
      if(directory===root)rmSync(input);else rmSync(directory,{recursive:true});
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("passive policy selection retains equivalent aliases and lone legacy defaults", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-passive-selection-")));
  try {
    const legacy=join(root,"io");mkdirSync(legacy,{mode:0o700});
    const link=join(root,"alias");symlinkSync(legacy,link);
    for(const environment of [
      {XDG_DATA_HOME:root},
      {GHOSTGET_STATE_HOME:legacy,WRENCH_STATE_HOME:link,OH_STATE_HOME:legacy,IO_HOME:legacy},
    ]) {
      expect(readWebPolicy(environment).revision).toBe(0);
      expect(readOperationPolicy(environment).managed).toBe(false);
      expect(readdirSync(legacy)).toEqual([]);
    }
    mkdirSync(join(root,"ghostget"),{mode:0o700});
    expect(()=>readWebPolicy({XDG_DATA_HOME:root})).toThrow("Requests are blocked");
    expect(()=>readOperationPolicy({XDG_DATA_HOME:root})).toThrow("execution is blocked");
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("passive policy probes reject unsafe collections, dangling links and remembered root replacement", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-passive-unsafe-")));
  try {
    for(const [index,read,collection,file] of [
      [0,readWebPolicy,"control","web-managed.json"],
      [1,readOperationPolicy,"operation-permissions","managed.json"],
    ] as const) {
      const directory=join(root,`ghostget-${index}`);mkdirSync(directory,{mode:0o700});
      const environment={GHOSTGET_STATE_HOME:directory};
      const selected=join(directory,collection);
      writeFileSync(selected,"not a directory",{mode:0o600});
      expect(()=>read(environment)).toThrow();rmSync(selected);
      symlinkSync(join(root,"missing-target"),selected);
      expect(()=>read(environment)).toThrow();rmSync(selected);
      mkdirSync(selected,{mode:0o755});chmodSync(selected,0o755);
      expect(()=>read(environment)).toThrow();rmSync(selected,{recursive:true});
      mkdirSync(selected,{mode:0o700});
      symlinkSync(join(root,"missing-file"),join(selected,file));
      expect(()=>read(environment)).toThrow();rmSync(selected,{recursive:true});
      expect(readdirSync(directory)).toEqual([]);
      ghostgetStateHome(environment);
      renameSync(directory,`${directory}-original`);mkdirSync(directory,{mode:0o700});
      expect(()=>read(environment)).toThrow();
      expect(readdirSync(directory)).toEqual([]);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("passive absence is never cached across policy activation, revision or corruption", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-passive-activation-")));
  const environment={GHOSTGET_STATE_HOME:root};
  try {
    expect(readWebPolicy(environment).revision).toBe(0);
    expect(readOperationPolicy(environment).managed).toBe(false);
    saveWebPolicy([],true,0,environment);
    enableOperationPermissions(0,environment);
    expect(()=>assertGatewayCommandAllowed(["capture","https://example.com"],environment)).toThrow("gateway requests only");
    expect(readOperationPolicy(environment)).toMatchObject({managed:true,revision:1});
    saveWebPolicy([],false,1,environment);
    setOperationPolicyEntry("a".repeat(64),"deny",1,environment);
    expect(readWebPolicy(environment)).toMatchObject({gatewayOnly:false,revision:2});
    expect(readOperationPolicy(environment)).toMatchObject({managed:true,revision:2,entries:[{digest:"a".repeat(64),decision:"deny"}]});
    rmSync(join(root,"control","web-policy.json"));
    rmSync(join(root,"operation-permissions","policy.json"));
    expect(()=>readWebPolicy(environment)).toThrow("Requests are blocked");
    expect(()=>readOperationPolicy(environment)).toThrow("execution is blocked");
    writeFileSync(join(root,"control","web-policy.json"),"{}",{mode:0o600});
    writeFileSync(join(root,"operation-permissions","policy.json"),"{}",{mode:0o600});
    expect(()=>readWebPolicy(environment)).toThrow("Requests are blocked");
    expect(()=>readOperationPolicy(environment)).toThrow("execution is blocked");
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("policy absence rejects roots or collections changed during the bounded inspection", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"ghostget-passive-race-")));
  try {
    for(const [index,read,collection] of [
      [0,readWebPolicy,"control"],
      [1,readOperationPolicy,"operation-permissions"],
    ] as const)for(const fault of ["replace-root","create-collection","create-root","make-public"] as const) {
      const directory=join(root,`ghostget-${index}-${fault}`);
      if(fault!=="create-root")mkdirSync(directory,{mode:0o700});
      let selections=0;
      const environment={get GHOSTGET_STATE_HOME() {
        selections++;
        // The repeated root selection is a deterministic barrier before final
        // filesystem checks; inject the same drift a concurrent writer causes.
        if(selections===2) {
          if(fault==="replace-root") {renameSync(directory,`${directory}-old`);mkdirSync(directory,{mode:0o700});}
          else if(fault==="create-collection")mkdirSync(join(directory,collection),{mode:0o700});
          else if(fault==="create-root")mkdirSync(directory,{mode:0o700});
          else chmodSync(directory,0o755);
        }
        return directory;
      }};
      expect(()=>read(environment)).toThrow();
      expect(selections).toBe(2);
      expect(existsSync(join(directory,".io-state.json"))).toBe(false);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});
