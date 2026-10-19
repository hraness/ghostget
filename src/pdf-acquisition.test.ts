import {test,expect} from 'bun:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runPdfAcquisition} from './pdf-acquisition.js';
test('public facade preserves local capture native runner injection and structured failure',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pdf-sdk-'));try{
  const input=join(root,'input.pdf');writeFileSync(input,'%PDF-1.4\n%%EOF');let stdout='',calls=0;
  const result=await runPdfAcquisition([input,'--output',join(root,'out'),'--json'],{HOME:root,GHOSTGET_STATE_DIR:join(root,'state')},{stdout:value=>{stdout+=value;},stderr:()=>{}},{tools:{pdfinfo:'/fixture/pdfinfo',pdftohtml:'/fixture/pdftohtml',tesseract:null},runTool:async()=>{calls++;throw Error('controlled native failure');}});
  expect(result).toBe(1);expect(calls).toBeGreaterThan(0);expect(JSON.parse(stdout).ok).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('public facade does not bypass authenticated account validation',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pdf-sdk-auth-'));try{let stdout='';
 const result=await runPdfAcquisition(['https://example.com/a.pdf','--auth','absent-account','--json'],{HOME:root,GHOSTGET_STATE_DIR:join(root,'state')},{stdout:value=>{stdout+=value;},stderr:()=>{}},{runTool:async()=>{throw Error('must not extract');}});
 expect(result).not.toBe(0);expect(JSON.parse(stdout).ok).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
