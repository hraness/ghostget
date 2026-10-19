import {expect, test} from 'bun:test';
import {mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {acquireEphemeralMedia, type EphemeralDependencies} from './ephemeral-acquire';
import {cleanupEphemeralStage, inspectEphemeralStage} from './ephemeral-stage';
import {parseProbeMetadata} from './metadata';
import type {CaptureYtDlpOptions} from './yt-dlp';
const url = 'https://www.youtube.com/watch?v=abcdefghijk';
const metadata = parseProbeMetadata({id:'abcdefghijk',extractor:'Youtube',webpage_url:url,title:'Fixture',duration:10,subtitles:{en:[{ext:'vtt'}]}},url);
if (!metadata.ok) throw new Error('fixture');
function dependencies(): {deps: EphemeralDependencies; calls: CaptureYtDlpOptions[]} {
  const calls: CaptureYtDlpOptions[] = [];
  const deps: EphemeralDependencies = {
    findExecutable: async name => name,
    probeHttp: async () => ({ok:false,kind:'not-applicable',reason:'declared-text'}),
    probe: async () => {if (!metadata.ok) throw new Error("fixture"); return metadata;},
    capture: async options => {
      calls.push(options);
      await writeFile(join(options.captureDirectory,options.mode === 'transcript' ? 'media.en.vtt':'media.m4a'), options.mode === 'transcript' ? 'WEBVTT\n\n00:00.000 --> 00:10.000\nHello fixture.\n':'fake-audio');
      return {ok:true,identity:{extractor:'Youtube',id:'abcdefghijk',ext:options.mode === 'transcript'?'vtt':'m4a'}};
    },
    captureHttp: async () => {throw new Error('unexpected');},
    run: async () => ({ok:true,exitCode:0,command:[],stdout:'{"format":{"duration":"10"},"streams":[{"codec_type":"audio"}]}',stderr:'',stdoutTruncated:false,stderrTruncated:false,elapsedMs:1}),
  }; return {deps,calls};
}
async function temporary(run: (root:string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(),'ephemeral-media-')));
  try {await run(root);} finally {await rm(root,{recursive:true,force:true});}
}
test('caption-first returns hashed timed captions without audio download or archive', async () => temporary(async root => {
  const {deps,calls} = dependencies();
  const result = await acquireEphemeralMedia({url,stagingParent:root},deps);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(calls.map(call=>call.mode)).toEqual(['transcript']);
  expect(result.manifest.retainedSourceArchive).toBe(false);
  expect(result.manifest.files.map(file=>file.role)).toEqual(['captions']);
  expect(result.manifest.caption).toEqual({source:'manual',language:'en'});
  expect((await inspectEphemeralStage(result.receipt)).state).toBe('ready');
  expect(JSON.parse(await readFile(join(result.receipt.root,'media.json'),'utf8'))).toEqual(result.manifest);
  expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
}));
test('unusable captions fall back to strict audio-only and never invoke ASR', async () => temporary(async root => {
  const {deps,calls} = dependencies(), capture = deps.capture;
  deps.capture = async options => {const result = await capture(options); if(options.mode==='transcript') await writeFile(join(options.captureDirectory,'media.en.vtt'),'WEBVTT\n\ninvalid'); return result;};
  const result = await acquireEphemeralMedia({url,stagingParent:root},deps);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(calls.map(call=>call.mode)).toEqual(['transcript','audio']);
  expect(calls.every(call=>call.audioOnly && !call.inheritConfig)).toBe(true);
  expect(result.manifest.caption).toBe(null); expect(result.manifest.files[0]?.role).toBe('audio');
  expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
}));
test('explicit local retranscription acquires audio despite available provider captions', async () => temporary(async root => {
  const {deps,calls}=dependencies();
  const result=await acquireEphemeralMedia({url,stagingParent:root,preferAudio:true},deps);
  expect(result.ok).toBe(true);if(!result.ok)return;
  expect(calls.map(call=>call.mode)).toEqual(['audio']);
  expect(result.manifest.caption).toBe(null);
  expect(result.manifest.files.map(file=>file.role)).toEqual(['audio']);
  expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
}));
test('live and playlist are unsupported, no download or retained stage', async () => temporary(async root => {
  for (const reason of ['live','playlist'] as const) {
    const {deps,calls} = dependencies(); deps.probe = async () => ({ok:false,kind:'unsupported',reason,message:'unsupported'});
    expect(await acquireEphemeralMedia({url,stagingParent:root},deps)).toEqual({ok:false,code:'unsupported',cleanup:'settled'});
    expect(calls).toHaveLength(0);
  }
}));
test('private selected route never falls back to public HTTP and stores only realm digest', async () => temporary(async root => {
  const {deps} = dependencies(); deps.probeHttp = async () => {throw new Error('private route downgrade');};
  const result = await acquireEphemeralMedia({url,stagingParent:root,browser:'chrome',authContext:'private-account'},deps);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.manifest.source.accountFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  expect(JSON.stringify(result.manifest)).not.toContain('private-account');
  expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
  deps.probe = async () => ({ok:false,diagnostic:'denied'});
  expect(await acquireEphemeralMedia({url,stagingParent:root,browser:'chrome',authContext:'private-account'},deps)).toEqual({ok:false,code:'permission-or-provider-failure',cleanup:'settled'});
}));
test('signed-in opaque probe gates on the item duration it never persists', async () => temporary(async root => {
  const raw = {id:'abcdefghijk',extractor:'youtube',extractor_key:'Youtube',webpage_url:url,title:'Private title',duration:10,subtitles:{en:[{ext:'vtt'}]}};
  const signedIn = (value: Record<string, unknown>) => async (options: {authContextSha256?: string}) => {
    const parsed = parseProbeMetadata(value,url,{mode:'browser',contextSha256:options.authContextSha256!});
    if (!parsed.ok) throw new Error('fixture'); return parsed;
  };
  const {deps,calls} = dependencies();
  deps.probe = signedIn(raw);
  const result = await acquireEphemeralMedia({url,stagingParent:root,browser:'chrome',authContext:'private-account'},deps);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(calls.map(call=>call.mode)).toEqual(['transcript']);
  expect(result.manifest.source.accountFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  expect(JSON.stringify(result.manifest)).not.toContain('Private title');
  expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
  const {duration: _duration, ...unbounded} = raw;
  deps.probe = signedIn(unbounded);
  expect(await acquireEphemeralMedia({url,stagingParent:root,browser:'chrome',authContext:'private-account'},deps)).toEqual({ok:false,code:'unsupported',cleanup:'settled'});
}));
test('duration limit and cancellation fail before promotion', async () => temporary(async root => {
  const {deps,calls} = dependencies();
  expect(await acquireEphemeralMedia({url,stagingParent:root,maxDurationSeconds:5},deps)).toEqual({ok:false,code:'limit-exceeded',cleanup:'settled'});
  expect(await acquireEphemeralMedia({url,stagingParent:root,signal:AbortSignal.abort()},deps)).toEqual({ok:false,code:'cancelled',cleanup:'settled'});
  expect(calls).toHaveLength(0);
}));
test('unbound inherited custody is rejected before work', async () => temporary(async root => {
  expect(await acquireEphemeralMedia({url,stagingParent:root,processGroup:'inherit'},dependencies().deps)).toEqual({ok:false,code:'invalid-input',cleanup:'settled'});
}));
test('bounded audio-only direct response uses transport hashes and no yt-dlp', async () => temporary(async root => {
  const {DirectHttpProbeTransport} = await import('./http-probe');
  const {captureDirectHttp} = await import('./http-capture');
  const {createHash} = await import('node:crypto');
  const source = 'https://example.com/episode.m4a?token=secret';
  const digest = createHash('sha256').update(source).digest('hex');
  const body = new Uint8Array(64); new DataView(body.buffer).setUint32(0,16,false); body.set(new TextEncoder().encode('ftyp'),4);
  const probe = {transport:new DirectHttpProbeTransport(source),publicOrigin:'https://example.com/',requestedUrlSha256:digest,effectiveUrlSha256:digest,redirectCount:0,declaredMediaType:'audio/mp4',lastModified:null,validator:{strength:'absent' as const},media:{container:'iso-bmff' as const,extension:'mp4' as const,mediaType:'video/mp4' as const},expectedBytes:64};
  const {deps,calls} = dependencies(); deps.probeHttp = async () => ({ok:true,probe});
  deps.probe = async () => {throw new Error('unexpected yt-dlp');};
  deps.captureHttp = (value,sink,options) => captureDirectHttp(value,sink,options,{request:async()=>({response:new Response(body,{headers:{'Content-Type':'audio/mp4','Content-Length':'64'}}),requestedUrl:new URL(source),effectiveUrl:new URL(source),redirectCount:0,dispose:()=>{}})});
  const result = await acquireEphemeralMedia({url:source,stagingParent:root},deps);
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.manifest.files.map(file=>file.role)).toEqual(['audio']);expect(calls).toHaveLength(0);
  expect(result.manifest.source.requestedUrlSha256).toBe(digest);
  expect(JSON.stringify(result.manifest)).not.toContain('secret');
  expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
}));
test('mid-capture cancellation settles owned files and no success is promoted', async () => temporary(async root => {
  const {deps} = dependencies(), controller = new AbortController();
  deps.capture = async options => {
    await writeFile(join(options.captureDirectory,'partial'),'discard'); controller.abort();
    return {ok:false,diagnostic:'cancelled',processReason:'aborted'};
  };
  expect(await acquireEphemeralMedia({url,stagingParent:root,signal:controller.signal},deps)).toEqual({ok:false,code:'cancelled',cleanup:'settled'});
}));
test('unknown process custody cannot claim cleanup settled', async () => temporary(async root => {
  const {deps} = dependencies(); deps.capture = async () => {throw new Error('unexpected runner exception');};
  const result = await acquireEphemeralMedia({url,stagingParent:root},deps);
  expect(result.ok).toBe(false); if(result.ok)return;
  expect(result.code).toBe('cleanup-required');expect(result.cleanup).toBe('pending');expect(result.receipt).toBeDefined();
}));
test('named account is resolved once, revalidated before ready and never anonymously downgraded', async () => temporary(async root => {
 const {deps,calls}=dependencies();let reads=0;deps.loadAccount=async()=>{reads++;return {auth:{schemaVersion:1,id:'personal',kind:'cookie-source',source:'chrome',profile:'Profile 1'},contentSha256:'a'.repeat(64)};};
 const result=await acquireEphemeralMedia({url,stagingParent:root,accountId:'personal'},deps);expect(result.ok).toBe(true);if(!result.ok)return;expect(reads).toBe(2);expect(calls[0]?.browser).toBe('chrome:Profile 1');expect(result.manifest.source.accountFingerprint).toMatch(/^[a-f0-9]{64}$/u);expect(await cleanupEphemeralStage(result.receipt)).toEqual({status:'settled'});
}));
test('changed, missing, unsupported and ambiguous accounts cannot publish or anonymously probe', async () => temporary(async root => {
 const {deps,calls}=dependencies();let reads=0;deps.loadAccount=async()=>({auth:{schemaVersion:1,id:'personal',kind:'cookie-source',source:'chrome'},contentSha256:(++reads===1?'a':'b').repeat(64)});
 expect(await acquireEphemeralMedia({url,stagingParent:root,accountId:'personal'},deps)).toEqual({ok:false,code:'integrity',cleanup:'settled'});
 calls.length=0;deps.loadAccount=async()=>{throw Error('missing');};expect(await acquireEphemeralMedia({url,stagingParent:root,accountId:'personal'},deps)).toEqual({ok:false,code:'permission-or-provider-failure',cleanup:'settled'});expect(calls).toHaveLength(0);
 expect(await acquireEphemeralMedia({url,stagingParent:root,accountId:'personal',browser:'chrome'},deps)).toEqual({ok:false,code:'invalid-input',cleanup:'settled'});
 deps.loadAccount=async()=>({auth:{schemaVersion:1,id:'personal',kind:'cookies-file',path:'/private/cookies'},contentSha256:'a'.repeat(64)});expect(await acquireEphemeralMedia({url,stagingParent:root,accountId:'personal'},deps)).toEqual({ok:false,code:'unsupported',cleanup:'settled'});expect(calls).toHaveLength(0);
}));
