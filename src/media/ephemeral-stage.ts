import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {chmod, lstat, mkdir, open, readdir, realpath, rename, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import type {EphemeralCleanupResult, EphemeralStageReceipt, EphemeralSupervisorIdentity, EphemeralCleanupAcknowledgment} from './ephemeral-types';
interface Marker {receipt: EphemeralStageReceipt; pid: number; state: 'acquiring' | 'ready'}
const markerName = 'ownership.json';
async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, constants.O_RDONLY);
  try {await directory.sync();} finally {await directory.close();}
}
function exactKeys(value: object, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key));
}
export function validSupervisor(value: unknown): value is EphemeralSupervisorIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const owner = value as EphemeralSupervisorIdentity;
  return exactKeys(owner, ['requestId', 'processGroupId', 'processStartIdentity']) &&
    typeof owner.requestId === 'string' && /^[a-zA-Z0-9-]{1,128}$/u.test(owner.requestId) &&
    Number.isSafeInteger(owner.processGroupId) && owner.processGroupId > 1 &&
    typeof owner.processStartIdentity === 'string' && owner.processStartIdentity.length > 0 && owner.processStartIdentity.length <= 256;
}
function validReceipt(value: unknown): value is EphemeralStageReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as EphemeralStageReceipt;
  return exactKeys(receipt, ['schemaVersion', 'token', 'root', 'device', 'inode'], ['supervisor']) &&
    receipt.schemaVersion === 1 && typeof receipt.token === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(receipt.token) &&
    typeof receipt.root === 'string' && resolve(receipt.root) === receipt.root && receipt.root.endsWith(`/media-${receipt.token}`) &&
    Number.isSafeInteger(receipt.device) && receipt.device >= 0 && Number.isSafeInteger(receipt.inode) && receipt.inode > 0 &&
    (receipt.supervisor === undefined || validSupervisor(receipt.supervisor));
}
export async function canonicalPrivateDirectory(path: string): Promise<void> {
  if (resolve(path) !== path || await realpath(path) !== path) throw new Error('integrity');
  const stat = await lstat(path);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error('integrity');
  for (let parent = dirname(path);; parent = dirname(parent)) {
    if ((await lstat(parent)).isSymbolicLink()) throw new Error('integrity');
    if (dirname(parent) === parent) break;
  }
}
async function durableJson(path: string, value: unknown): Promise<void> {
  const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {await file.writeFile(JSON.stringify(value)); await file.sync();} finally {await file.close();}
}
export async function createEphemeralStage(parent: string, supervisor?: EphemeralSupervisorIdentity): Promise<EphemeralStageReceipt> {
  if (supervisor !== undefined && !validSupervisor(supervisor)) throw new Error('integrity');
  await canonicalPrivateDirectory(parent);
  const token = randomUUID(), root = join(parent, `media-${token}`);
  await mkdir(root, {mode: 0o700}); await chmod(root, 0o700);
  const stat = await lstat(root);
  const receipt: EphemeralStageReceipt = {schemaVersion: 1, root, token, device: stat.dev, inode: stat.ino, ...(supervisor === undefined ? {} : {supervisor})};
  await durableJson(join(root, markerName), {receipt, pid: process.pid, state: 'acquiring'});
  await syncDirectory(root); await syncDirectory(parent);
  return receipt;
}
export async function inspectEphemeralStage(receipt: EphemeralStageReceipt): Promise<Marker> {
  if (!validReceipt(receipt)) throw new Error('integrity');
  await canonicalPrivateDirectory(receipt.root);
  const stat = await lstat(receipt.root);
  if (stat.dev !== receipt.device || stat.ino !== receipt.inode) throw new Error('integrity');
  const file = await open(join(receipt.root, markerName), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > 4096 || (info.mode & 0o077) !== 0) throw new Error('integrity');
    const value: unknown = JSON.parse(await file.readFile('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value, ['receipt', 'pid', 'state'])) throw new Error('integrity');
    const marker = value as Marker;
    if (!validReceipt(marker.receipt) || JSON.stringify(marker.receipt) !== JSON.stringify(receipt) || !Number.isSafeInteger(marker.pid) || marker.pid < 1 || !['acquiring','ready'].includes(marker.state)) throw new Error('integrity');
    return marker;
  } finally {await file.close();}
}
/** Called only once every owned subprocess has settled. */
export async function markEphemeralStageReady(receipt: EphemeralStageReceipt): Promise<void> {
  const marker = await inspectEphemeralStage(receipt);
  if (marker.pid !== process.pid) throw new Error('integrity');
  const temporary = join(receipt.root, `ownership-${randomUUID()}.json`);
  await durableJson(temporary, {...marker, state: 'ready'});
  await rename(temporary, join(receipt.root, markerName)); await syncDirectory(receipt.root);
}
export async function stageInventory(root: string, maximumBytes: number): Promise<{bytes: number; files: string[]}> {
  let bytes = 0, count = 0;
  const files: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const name of await readdir(path)) {
      if (++count > 256) throw new Error('limit-exceeded');
      const child = join(path, name), stat = await lstat(child);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw new Error('integrity');
      if (stat.isDirectory()) await visit(child);
      else {bytes += stat.size; if (bytes > maximumBytes) throw new Error('limit-exceeded'); files.push(child);}
    }
  }
  await visit(root); return {bytes, files};
}
export async function cleanupEphemeralStage(receipt: EphemeralStageReceipt, acknowledgment?: EphemeralCleanupAcknowledgment): Promise<EphemeralCleanupResult> {
  try {
    if (!validReceipt(receipt)) return {status: 'pending'};
    const marker = await inspectEphemeralStage(receipt);
    // A dead parent's subprocesses may survive SIGKILL. Never infer custody from PID absence.
    if (marker.state !== 'ready') {
      const supervisor = receipt.supervisor;
      if (!acknowledgment || !exactKeys(acknowledgment, ['custody', 'supervisor']) || !validSupervisor(acknowledgment.supervisor)) return {status: 'pending'};
      if (!supervisor || acknowledgment.custody !== 'supervisor-reaped' || JSON.stringify(acknowledgment.supervisor) !== JSON.stringify(supervisor)) return {status: 'pending'};
      // A receipt is data ownership, not permission to signal a process. Zero only checks absence.
      for (const pid of [marker.pid, -supervisor.processGroupId]) {
        try {process.kill(pid, 0); return {status: 'pending'};}
        catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return {status: 'pending'};}
      }
    }
    await stageInventory(receipt.root, Number.MAX_SAFE_INTEGER);
    await inspectEphemeralStage(receipt);
    await rm(receipt.root, {recursive: true});
    return {status: 'settled'};
  } catch {return {status: 'pending'};}
}
