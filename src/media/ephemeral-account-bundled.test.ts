import {expect,test} from 'bun:test';
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAuth,saveAuth} from '../auth';
import {sourceHelperPath} from '../storage';
const packageRoot = resolve(import.meta.dir,'../..');
test('helpers resolve to shipped source from both src and bundled dist modules',()=>{
 for (const module of ['src/storage.ts','dist/index-chunk.js']) expect(sourceHelperPath('state-helper.ts',pathToFileURL(join(packageRoot,module)).href)).toBe(join(packageRoot,'src','state-helper.ts'));
});
// Regression: the bundled SDK resolved its private-state helper inside dist/,
// so every saved-account acquisition failed before reading the account.
test('bundled media SDK reads a saved account through the shipped state helper', async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(),'ephemeral-bundled-')));
 try {
  const environment = {HOME:root,PATH:'/usr/bin:/bin',HRANESS_NO_UPDATE:'1',GHOSTGET_STATE_HOME:join(root,'ghostget')};
  // Arc is a cookie source yt-dlp cannot read: a readable account is unsupported, never a provider failure.
  saveAuth(createAuth('arc-fixture',{source:'arc'}),environment);
  const script = join(root,'acquire.ts');
  await writeFile(script,`const sdk = await import(${JSON.stringify(join(packageRoot,'dist','media-acquisition.js'))});
process.stdout.write(JSON.stringify(await sdk.acquireEphemeralMedia({url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',stagingParent:${JSON.stringify(root)},accountId:'arc-fixture'})));`);
  const child = Bun.spawnSync([process.execPath,script],{cwd:root,env:environment,stdout:'pipe',stderr:'pipe'});
  expect(JSON.parse(child.stdout.toString())).toEqual({ok:false,code:'unsupported',cleanup:'settled'});
 } finally {await rm(root,{recursive:true,force:true});}
});
