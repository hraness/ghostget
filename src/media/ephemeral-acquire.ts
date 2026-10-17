import {createHash} from 'node:crypto';
import type {AuthSnapshot} from '../auth';
import {ephemeralAccountSelection} from './ephemeral-account';
import {constants} from 'node:fs';
import {mkdir, open, readFile, writeFile} from 'node:fs/promises';
import {basename, join, relative} from 'node:path';
import {routeSource} from './source-router';
import {authContextSha256, providerIdentitySha256, selectCaption, type ProbeMetadata} from './metadata';
import {probeWithYtDlp, captureWithYtDlp, type CaptureYtDlpOptions, type ProbeYtDlpOptions, type YtDlpCaptureResult, type YtDlpProbeResult} from './yt-dlp';
import {findExecutable, runProcess, type CommandArgv, type RunProcessOptions, type ProcessResult} from './process';
import {probeDirectHttp, type DirectHttpProbeOptions, type DirectHttpProbeResult} from './http-probe';
import {captureDirectHttp, type DirectHttpCaptureOptions, type DirectHttpCaptureResult, type DirectHttpCaptureSink} from './http-capture';
import type {DirectHttpProbe} from './http-probe';
import {parseWebVtt} from './transcript';
import {createEphemeralStage, markEphemeralStageReady, cleanupEphemeralStage, stageInventory, validSupervisor} from './ephemeral-stage';
import type {EphemeralMediaRequest, EphemeralMediaResult, EphemeralMediaManifest, EphemeralMediaFile, EphemeralMediaErrorCode, EphemeralStageReceipt} from './ephemeral-types';
const hardBytes = 512 * 1024 * 1024;
export interface EphemeralDependencies {
  loadAccount?: (id: string) => Promise<AuthSnapshot>;
  findExecutable: (name: string) => Promise<string | null>;
  probe: (options: ProbeYtDlpOptions) => Promise<YtDlpProbeResult>;
  capture: (options: CaptureYtDlpOptions) => Promise<YtDlpCaptureResult>;
  probeHttp: (url: string, options: DirectHttpProbeOptions) => Promise<DirectHttpProbeResult>;
  captureHttp: (probe: DirectHttpProbe, sink: DirectHttpCaptureSink, options: DirectHttpCaptureOptions) => Promise<DirectHttpCaptureResult>;
  run: (argv: CommandArgv, options: RunProcessOptions) => Promise<ProcessResult>;
}
const defaults: EphemeralDependencies = {findExecutable, probe: probeWithYtDlp, capture: captureWithYtDlp, probeHttp: probeDirectHttp, captureHttp: captureDirectHttp, run: runProcess};
class AcquisitionError extends Error {constructor(readonly code: EphemeralMediaErrorCode) {super(code);}}
function fail(code: EphemeralMediaErrorCode): never {throw new AcquisitionError(code);}
function bound(value: number | undefined, fallback: number, maximum: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) fail('invalid-input');
  return selected;
}
function sha(data: Uint8Array | string): string {return createHash('sha256').update(data).digest('hex');}
function progress(request: EphemeralMediaRequest, phase: 'probe' | 'captions' | 'audio' | 'verified', bytes = 0): void {
  try {request.onProgress?.({phase, bytes});} catch { /* Observers do not own acquisition. */ }
}
async function tool(deps: EphemeralDependencies, name: string): Promise<string> {const path = await deps.findExecutable(name); if (!path) fail('unavailable'); return path;}
async function audioDuration(path: string, deps: EphemeralDependencies, signal: AbortSignal, maximum: number, processGroup: 'owned' | 'inherit' | undefined): Promise<number> {
  const result = await deps.run([await tool(deps, 'ffprobe'), '-v','error','-protocol_whitelist','file,pipe','-show_entries','format=duration:stream=codec_type','-of','json',path], {signal, processGroup: processGroup !== 'inherit', timeoutMs: 30_000, maxOutputBytes: 65536});
  if (!result.ok || result.stdoutTruncated) fail('integrity');
  const value: unknown = JSON.parse(result.stdout);
  if (!value || typeof value !== 'object') fail('integrity');
  const record = value as {format?: {duration?: unknown}; streams?: {codec_type?: unknown}[]};
  const duration = Number(record.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(record.streams) || !record.streams.some(s => s.codec_type === 'audio') || record.streams.some(s => s.codec_type === 'video')) fail('unsupported');
  if (duration > maximum) fail('limit-exceeded');
  return duration;
}
async function fileRecord(root: string, path: string, role: EphemeralMediaFile['role'], maximum: number): Promise<EphemeralMediaFile> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > maximum) fail('integrity');
    // Hash incrementally: audio never occupies a second full-size memory buffer.
    const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024); let bytes = 0;
    for (;;) {const read = await file.read(buffer, 0, buffer.length, null); if (!read.bytesRead) break; bytes += read.bytesRead; if (bytes > maximum) fail('limit-exceeded'); hash.update(buffer.subarray(0, read.bytesRead));}
    if (bytes !== stat.size) fail('integrity');
    return {path: relative(root, path), bytes, sha256: hash.digest('hex'), role};
  } finally {await file.close();}
}
interface Acquired {duration: number; metadata: ProbeMetadata | null; caption: EphemeralMediaManifest['caption']; files: EphemeralMediaFile[]; warnings: string[]}
async function directAudio(request: EphemeralMediaRequest, stage: EphemeralStageReceipt, probe: DirectHttpProbe, deps: EphemeralDependencies, signal: AbortSignal, maxBytes: number, maxDuration: number): Promise<Acquired> {
  progress(request, 'audio');
  const path = join(stage.root, 'audio'), file = await open(path, 'wx', 0o600); let offset = 0, closed = false;
  const close = async (): Promise<void> => {if (!closed) {closed = true; await file.close();}};
  const sink: DirectHttpCaptureSink = {
    write: async chunk => {let written = 0; while (written < chunk.length) {const result = await file.write(chunk, written, chunk.length-written, offset); if (!result.bytesWritten) fail('integrity'); offset += result.bytesWritten; written += result.bytesWritten;}},
    restart: async () => {await file.truncate(0); offset = 0;}, close, abort: close,
  };
  let result: DirectHttpCaptureResult;
  try {result = await deps.captureHttp(probe, sink, {signal, maximumBodyBytes: maxBytes});} finally {await close();}
  if (!result.ok) fail(result.error.code === 'body-too-large' ? 'limit-exceeded' : 'permission-or-provider-failure');
  const duration = await audioDuration(path, deps, signal, maxDuration, request.processGroup), record = await fileRecord(stage.root, path, 'audio', maxBytes);
  if (record.sha256 !== result.capture.sha256 || record.bytes !== result.capture.bytes) fail('integrity');
  return {duration, metadata: null, caption: null, files: [record], warnings: []};
}
async function providerMedia(request: EphemeralMediaRequest, stage: EphemeralStageReceipt, deps: EphemeralDependencies, signal: AbortSignal, maxBytes: number, maxDuration: number): Promise<Acquired> {
  const executable = await tool(deps, 'yt-dlp');
  const auth = {inheritConfig: false, ...(request.processGroup === undefined ? {} : {processGroup: request.processGroup}), ...(request.browser === undefined ? {} : {browser: request.browser, authContextSha256: authContextSha256(request.authContext!)} )};
  const probe = await deps.probe({executable, url: request.url, signal, ...auth});
  if (!probe.ok) fail('kind' in probe && probe.kind === 'unsupported' ? 'unsupported' : 'permission-or-provider-failure');
  const metadata = probe.metadata, duration = metadata.durationSeconds;
  // Unknown duration must not silently pass the finite-item gate.
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) fail('unsupported');
  if (duration > maxDuration) fail('limit-exceeded');
  const directory = join(stage.root, 'capture'), temporary = join(stage.root, 'temporary');
  await mkdir(directory, {mode: 0o700}); await mkdir(temporary, {mode: 0o700});
  const selected = request.preferAudio ? null : selectCaption(metadata, request.language ?? 'en');
  const capture = async (mode: 'transcript' | 'audio'): Promise<void> => {
    progress(request, mode === 'transcript' ? 'captions' : 'audio');
    const result = await deps.capture({executable, url: request.url, signal, ...auth, mode, captureDirectory: directory, temporaryDirectory: temporary, caption: mode === 'transcript' ? selected : null, persistDescriptiveMetadata: true, audioOnly: true, maximumBytes: maxBytes, timeoutMs: request.timeoutMs ?? 600_000, privateRedactions: metadata.diagnosticRedactions});
    if (!result.ok) fail('permission-or-provider-failure');
    if (result.identity.extractor !== metadata.acquisitionIdentity.extractor || result.identity.id !== metadata.acquisitionIdentity.id) fail('integrity');
    // Only a skip-download caption capture may omit the primary media extension.
    if (mode === 'audio' && result.identity.ext === null) fail('integrity');
  };
  let caption: EphemeralMediaManifest['caption'] = null; const records: EphemeralMediaFile[] = [], warnings: string[] = [];
  if (selected) {
    await capture('transcript');
    const paths = (await stageInventory(directory, maxBytes)).files.filter(path => path.endsWith('.vtt'));
    if (paths.length === 1 && paths[0]) {
      const record = await fileRecord(stage.root, paths[0], 'captions', Math.min(maxBytes, 8 * 1024 * 1024));
      const parsed = parseWebVtt(await readFile(paths[0], 'utf8'));
      // Require well-formed bounded times. Captions cannot prove verbatim completeness.
      if (parsed.ok && parsed.cues.every(c => c.startMs >= 0 && c.endMs <= duration * 1000 + 1000) && (parsed.cues[0]?.startMs ?? Infinity) <= 30000 && (parsed.cues.at(-1)?.endMs ?? 0) >= duration * 900) {records.push(record); caption = selected; warnings.push('provider-caption-completeness-unverified');}
    }
    if (!caption) warnings.push('provider-captions-unusable');
  }
  if (!caption) {
    await capture('audio');
    const audio = (await stageInventory(directory, maxBytes)).files.filter(path => /^media\.(?:m4a|mp3|ogg|opus|wav|webm|mp4|aac|flac)$/u.test(basename(path)));
    if (audio.length !== 1 || !audio[0]) fail('integrity');
    const observed = await audioDuration(audio[0], deps, signal, maxDuration, request.processGroup);
    if (Math.abs(observed-duration) > Math.max(2, duration * 0.02)) fail('integrity');
    records.push(await fileRecord(stage.root, audio[0], 'audio', maxBytes));
  }
  const thumbnails = (await stageInventory(directory, maxBytes)).files.filter(path => /^media\.(?:jpg|jpeg|png|webp)$/u.test(basename(path)));
  if (thumbnails.length > 1) fail('integrity');
  if (thumbnails[0]) records.push(await fileRecord(stage.root, thumbnails[0], 'thumbnail', Math.min(maxBytes, 16*1024*1024)));
  return {duration, metadata, caption, files: records, warnings};
}
export async function acquireEphemeralMedia(request: EphemeralMediaRequest, deps: EphemeralDependencies = defaults): Promise<EphemeralMediaResult> {
  let receipt: EphemeralStageReceipt | undefined;
  let controller: AbortController | undefined, monitor: ReturnType<typeof setInterval> | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
  let monitoring: Promise<void> = Promise.resolve(), monitoringActive = false, monitorFailure: EphemeralMediaErrorCode | undefined, timedOut = false, subprocessSettled = true;
  const abort = (): void => controller?.abort();
  try {
    let accountSnapshot: AuthSnapshot | undefined;
    const loadAccount = deps.loadAccount ?? (async (id: string) => (await import('../auth')).loadAuthSnapshot(id));
    if (request.accountId !== undefined) {
      if (typeof request.accountId !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/u.test(request.accountId) || request.browser !== undefined || request.authContext !== undefined) fail('invalid-input');
      try {accountSnapshot = await loadAccount(request.accountId);} catch {fail('permission-or-provider-failure');}
      try {request = {...request,...ephemeralAccountSelection(accountSnapshot,request.accountId)};} catch(error) {fail(error instanceof Error && error.message === 'integrity' ? 'integrity' : 'unsupported');}
    }
    if (request.preferAudio !== undefined && typeof request.preferAudio !== 'boolean') fail('invalid-input');
    const maxBytes = bound(request.maxBytes, 128*1024*1024, hardBytes), maxDuration = bound(request.maxDurationSeconds, 3600, 4*3600), timeoutMs = bound(request.timeoutMs, 600_000, 3600_000);
    const route = routeSource({url: request.url, mode: 'audio', inheritYtDlpConfig: false, ...(request.browser === undefined ? {} : {browser: request.browser}), ...(request.authContext === undefined ? {} : {authContext: request.authContext})});
    if (route.kind === 'reject') fail('invalid-input');
    if (process.platform === 'win32') fail('unsupported');
    if (request.processGroup !== undefined && !['owned', 'inherit'].includes(request.processGroup)) fail('invalid-input');
    if (request.processGroup === 'inherit') {
      const owner = request.supervisor;
      if (!validSupervisor(owner)) fail('invalid-input');
    } else if (request.supervisor !== undefined) fail('invalid-input');
    receipt = await createEphemeralStage(request.stagingParent, request.supervisor); controller = new AbortController();
    request.signal?.addEventListener('abort', abort, {once: true}); if (request.signal?.aborted) abort();
    timeout = setTimeout(() => {timedOut = true; abort();}, timeoutMs);
    const stage = receipt;
    monitor = setInterval(() => {
      if (monitoringActive) return; monitoringActive = true;
      monitoring = stageInventory(stage.root, maxBytes + 16384).then(value => {progress(request, 'audio', value.bytes);}).catch(error => {monitorFailure = error instanceof Error && error.message === 'limit-exceeded' ? 'limit-exceeded' : 'integrity'; abort();}).finally(() => {monitoringActive = false;});
    }, 100);
    if (controller.signal.aborted) fail('cancelled');
    progress(request, 'probe'); let acquired: Acquired;
    // Once external work starts, unexpected exceptions leave explicit pending custody.
    subprocessSettled = false;
    if (route.kind === 'direct-http') {
      const probe = await deps.probeHttp(route.requestUrl, {signal: controller.signal, maximumBodyBytes: maxBytes});
      if (probe.ok) acquired = await directAudio(request, stage, probe.probe, deps, controller.signal, maxBytes, maxDuration);
      else if (probe.kind === 'not-applicable') acquired = await providerMedia(request, stage, deps, controller.signal, maxBytes, maxDuration);
      else fail(probe.error.code === 'body-too-large' ? 'limit-exceeded' : 'permission-or-provider-failure');
    } else acquired = await providerMedia(request, stage, deps, controller.signal, maxBytes, maxDuration);
    subprocessSettled = true;
    clearInterval(monitor); await monitoring;
    if (monitorFailure) fail(monitorFailure); if (controller.signal.aborted) fail(timedOut ? 'timeout' : 'cancelled');
    await stageInventory(stage.root, maxBytes + 16384);
    const metadata = acquired.metadata;
    const manifest: EphemeralMediaManifest = {schemaVersion: 1, kind: 'ephemeral-media', retainedSourceArchive: false,
      source: {requestedUrlSha256: route.requestUrlSha256, accountFingerprint: request.authContext ? authContextSha256(request.authContext) : null,
        providerIdentitySha256: metadata ? providerIdentitySha256(metadata.acquisitionIdentity.extractor, metadata.acquisitionIdentity.id) : sha(`direct-http:${route.requestUrlSha256}`), durationSeconds: acquired.duration,
        ...(metadata?.title === undefined ? {} : {title: metadata.title}), ...(metadata?.uploader === undefined ? {} : {author: metadata.uploader})}, caption: acquired.caption, files: acquired.files, warnings: acquired.warnings};
    if (accountSnapshot) {
      let current: AuthSnapshot;
      try {current = await loadAccount(request.accountId!);} catch {fail('permission-or-provider-failure');}
      if (current.auth.id !== accountSnapshot.auth.id || current.contentSha256 !== accountSnapshot.contentSha256) fail('integrity');
    }
    await writeFile(join(stage.root, 'media.json'), JSON.stringify(manifest), {mode: 0o600, flag: 'wx'});
    await markEphemeralStageReady(stage); progress(request, 'verified');
    return {ok: true, receipt: stage, manifest, cleanup: 'pending'};
  } catch (error) {
    clearInterval(monitor); await monitoring;
    // Typed errors are raised after awaited process runners have finished their group cleanup.
    if (error instanceof AcquisitionError) subprocessSettled = true;
    let cleanup: 'settled' | 'pending' = 'settled';
    if (receipt) {if (subprocessSettled) {try {await markEphemeralStageReady(receipt);} catch { /* Preserve marker for recovery. */ }} cleanup = (await cleanupEphemeralStage(receipt)).status;}
    const code = monitorFailure ?? (request.signal?.aborted ? 'cancelled' : timedOut ? 'timeout' : error instanceof AcquisitionError ? error.code : error instanceof Error && error.message === 'integrity' ? 'integrity' : 'unavailable');
    return {ok: false, code: cleanup === 'pending' ? 'cleanup-required' : code, cleanup, ...(receipt && cleanup === 'pending' ? {receipt} : {})};
  } finally {
    clearInterval(monitor); clearTimeout(timeout); await monitoring; request.signal?.removeEventListener('abort', abort);
  }
}
