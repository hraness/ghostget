import {expect,test} from 'bun:test';
import fc from 'fast-check';
import {assertProperty} from '../test-support';
import {mkdtemp,realpath,rm,writeFile,symlink,readFile,link,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEphemeralStage,cleanupEphemeralStage,markEphemeralStageReady,stageInventory,validSupervisor} from './ephemeral-stage';
async function temporary(run:(root:string)=>Promise<void>):Promise<void>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'media-stage-')));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('receipt exists before work and active acquiring custody stays pending',async()=>temporary(async root=>{
 const receipt=await createEphemeralStage(root);expect(JSON.parse(await readFile(join(receipt.root,'ownership.json'),'utf8')).state).toBe('acquiring');
 expect(await cleanupEphemeralStage(receipt)).toEqual({status:'pending'});
 await markEphemeralStageReady(receipt);expect(await cleanupEphemeralStage(receipt)).toEqual({status:'settled'});
}));
test('reject symlink root or nested asset without deleting original data',async()=>temporary(async root=>{
 const original=join(root,'original');await writeFile(original,'retain');
 const receipt=await createEphemeralStage(root);await markEphemeralStageReady(receipt);
 await symlink(original,join(receipt.root,'asset'));expect(await cleanupEphemeralStage(receipt)).toEqual({status:'pending'});
 expect(await readFile(original,'utf8')).toBe('retain');
 await symlink(root,join(root,'alias'));await expect(createEphemeralStage(join(root,'alias'))).rejects.toThrow('integrity');
}));
test('foreign ownership and replaced inode cannot clean a different directory',async()=>temporary(async root=>{
 const receipt=await createEphemeralStage(root);await markEphemeralStageReady(receipt);
 expect(await cleanupEphemeralStage({...receipt,inode:receipt.inode+1})).toEqual({status:'pending'});
 const moved=receipt.root+'-moved';await rename(receipt.root,moved);
 expect(await cleanupEphemeralStage(receipt)).toEqual({status:'pending'});
 expect(await readFile(join(moved,'ownership.json'),'utf8')).toContain(receipt.token);
}));
test('hard links and aggregate quota are rejected',async()=>temporary(async root=>{
 const receipt=await createEphemeralStage(root);await writeFile(join(receipt.root,'a'),'12345');
 await expect(stageInventory(receipt.root,4)).rejects.toThrow('limit-exceeded');
 await link(join(receipt.root,'a'),join(receipt.root,'b'));await expect(stageInventory(receipt.root,10000)).rejects.toThrow('integrity');
}));
test('live supervisor cannot be overridden by a cleanup acknowledgment',async()=>temporary(async root=>{
 const supervisor={requestId:'request-one',processGroupId:process.pid,processStartIdentity:'fixture'};
 const receipt=await createEphemeralStage(root,supervisor);
 expect(await cleanupEphemeralStage(receipt,{custody:'supervisor-reaped',supervisor})).toEqual({status:'pending'});
 expect(await cleanupEphemeralStage(receipt,{custody:'supervisor-reaped',supervisor:{...supervisor,requestId:'different'}})).toEqual({status:'pending'});
}));
test('SIGKILL leaves discoverable receipt; only matching reaped custody cleans acquiring stage',async()=>temporary(async root=>{
 for (const state of ['acquiring','ready'] as const) {
  const child = Bun.spawn([process.execPath,join(import.meta.dir,'ephemeral-stage.fixture.ts'),root,state],{detached:true,stdin:'ignore',stdout:'pipe',stderr:'pipe'});
  const reader = child.stdout.getReader();
  try {
   const chunk = await reader.read();if(chunk.done)throw new Error('no receipt');
   const receipt = JSON.parse(new TextDecoder().decode(chunk.value)) as Awaited<ReturnType<typeof createEphemeralStage>>;
   child.kill('SIGKILL');await child.exited;
   if(state === 'acquiring') {
    expect(await cleanupEphemeralStage(receipt)).toEqual({status:'pending'});
    expect(receipt.supervisor).toBeDefined();if(!receipt.supervisor)throw new Error('missing supervisor');
    expect(await cleanupEphemeralStage(receipt,{custody:'supervisor-reaped',supervisor:{...receipt.supervisor,requestId:'other'}})).toEqual({status:'pending'});
    expect(await cleanupEphemeralStage(receipt,{custody:'supervisor-reaped',supervisor:receipt.supervisor})).toEqual({status:'settled'});
   } else expect(await cleanupEphemeralStage(receipt)).toEqual({status:'settled'});
  } finally {child.kill('SIGKILL');await child.exited;reader.releaseLock();}
 }
}));
test('absent staging is uncertain without a retained settlement receipt and malformed receipts fail closed',async()=>temporary(async root=>{
 const receipt=await createEphemeralStage(root);await markEphemeralStageReady(receipt);
 expect(await cleanupEphemeralStage(receipt)).toEqual({status:'settled'});
 expect(await cleanupEphemeralStage(receipt)).toEqual({status:'pending'});
 expect(await cleanupEphemeralStage({...receipt,device:-1})).toEqual({status:'pending'});
 expect(await cleanupEphemeralStage({...receipt,supervisor:{requestId:'x',processGroupId:-123,processStartIdentity:'invalid'}})).toEqual({status:'pending'});
 expect(await cleanupEphemeralStage({...receipt,unexpected:true} as typeof receipt)).toEqual({status:'pending'});
}));
test('foreign ownership marker fields cannot grant cleanup authority',async()=>temporary(async root=>{
 const receipt=await createEphemeralStage(root);await markEphemeralStageReady(receipt);
 const path=join(receipt.root,'ownership.json'),marker=JSON.parse(await readFile(path,'utf8'));
 await writeFile(path,JSON.stringify({...marker,unexpected:true}));
 expect(await cleanupEphemeralStage(receipt)).toEqual({status:'pending'});
}));

test('property: supervisor admission never throws on JSON values and forbids extra fields',()=>{
 assertProperty(fc.property(fc.jsonValue(),value=>{
  expect(()=>validSupervisor(value)).not.toThrow();
  if(validSupervisor(value)) {
   expect(Object.keys(value).sort()).toEqual(['processGroupId','processStartIdentity','requestId']);
   expect(validSupervisor({...value as Record<string,unknown>,unexpected:true})).toBe(false);
  }
 }),{numRuns:500});
 assertProperty(fc.property(fc.integer({min:2,max:2147483647}),fc.string({minLength:1,maxLength:256}),(processGroupId,processStartIdentity)=>{
  const owner={requestId:'owned-request',processGroupId,processStartIdentity};
  expect(validSupervisor(owner)).toBe(true);
  expect(validSupervisor({...owner,unexpected:null})).toBe(false);
 }),{numRuns:100});
});
