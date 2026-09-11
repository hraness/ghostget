import { join } from "node:path";
import { canonicalJson, sha256 } from "../canonical-json";
import type { ProcessOwnerIdentity } from "../process-identity";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, listPrivateStateDirectory, readPrivateStateFileIfPresent, writePrivateJsonIfUnchanged } from "../storage";
import { readInterfaceJson } from "./interface-json";
import { ControlError, digest, integer, keys, oneOf, record } from "./validation";
import type { ControlEnvironment } from "./web-policy";

type Purpose = "credential" | "1password-bootstrap";
export type NativeCreateOutcome = "SUCCESS" | "CANCELLED" | "UNAVAILABLE" | "EXISTS" | "NOT_FOUND" | "INVALID";
interface Identity {
  readonly protocol: "ghostget.native-create/1";
  readonly id: string;
  readonly purpose: Purpose;
  readonly nativeOwner: ProcessOwnerIdentity;
}
export type NativeCreateReceipt = Identity & ({ readonly state: "started" } | { readonly state: "joined"; readonly outcome: NativeCreateOutcome });
export interface NativeCreateHandle { readonly receipt: NativeCreateReceipt & { readonly state: "started" }; readonly contentSha256: string }
const LIMIT = 2048;
const MAX_RECEIPTS = 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export function nativeCustodyUncertain(): ControlError {
  return new ControlError("VAULT_CUSTODY_UNCERTAIN", "Native credential creation could not be confirmed. Its pending record is retained. If restarting does not recover a completed receipt, inspect the Ghostget entry in macOS Keychain manually; automatic cleanup cannot resolve an unknown outcome.");
}
function id(value: unknown): string { if (typeof value !== "string" || !uuid.test(value)) throw nativeCustodyUncertain(); return value; }
export function parseNativeCreateReceipt(value: unknown): NativeCreateReceipt {
  const v = record(value); keys(v, v.state === "joined" ? ["protocol", "id", "purpose", "nativeOwner", "state", "outcome"] : ["protocol", "id", "purpose", "nativeOwner", "state"]);
  if (v.protocol !== "ghostget.native-create/1") throw nativeCustodyUncertain();
  const p = record(v.nativeOwner); keys(p, ["pid", "bootId", "processStartId"]);
  const identity: Identity = { protocol: "ghostget.native-create/1", id: id(v.id), purpose: oneOf(v.purpose, ["credential", "1password-bootstrap"]), nativeOwner: { pid: integer(p.pid, 2, 2 ** 31 - 1), bootId: digest(p.bootId), processStartId: digest(p.processStartId) } };
  return v.state === "joined" ? { ...identity, state: "joined", outcome: oneOf(v.outcome, ["SUCCESS", "CANCELLED", "UNAVAILABLE", "EXISTS", "NOT_FOUND", "INVALID"]) } : { ...identity, state: oneOf(v.state, ["started"]) };
}
function paths(identifier: string, environment: ControlEnvironment) {
  const directory = join(ghostgetStateHome(environment), "control", "vault-native-creates");
  return { directory, file: join(directory, `${id(identifier)}.json`) };
}
function read(identifier: string, environment: ControlEnvironment): { receipt: NativeCreateReceipt; contentSha256: string } | null {
  const text = readPrivateStateFileIfPresent(paths(identifier, environment).file, LIMIT, "native credential custody", environment);
  if (text === null) return null;
  const receipt = parseNativeCreateReceipt(readInterfaceJson(text, LIMIT));
  if (receipt.id !== identifier) throw nativeCustodyUncertain();
  return { receipt, contentSha256: sha256(text) };
}
/** Must finish durably before the first create-request byte is sent to native stdin. */
export function beginNativeCreate(identifier: string, purpose: Purpose, nativeOwner: ProcessOwnerIdentity, environment: ControlEnvironment): NativeCreateHandle {
  try {
    const receipt = parseNativeCreateReceipt({ protocol: "ghostget.native-create/1", id: identifier, purpose, nativeOwner, state: "started" });
    if (receipt.state !== "started") throw nativeCustodyUncertain();
    const p = paths(identifier, environment); ensurePrivateStateDirectory(p.directory, environment);
    if (listPrivateStateDirectory(p.directory, environment).length >= MAX_RECEIPTS) throw nativeCustodyUncertain();
    if (!createPrivateJsonIfAbsent(p.file, receipt, { environment }).created) throw nativeCustodyUncertain();
    const persisted = read(identifier, environment);
    if (!persisted || canonicalJson(persisted.receipt) !== canonicalJson(receipt)) throw nativeCustodyUncertain();
    return { receipt, contentSha256: persisted.contentSha256 };
  } catch { throw nativeCustodyUncertain(); }
}
/** Only a strict terminal native reply plus joined stdin/stdout/process earns this transition. */
export function finishNativeCreate(handle: NativeCreateHandle, outcome: NativeCreateOutcome, environment: ControlEnvironment): void {
  try {
    const next = parseNativeCreateReceipt({ ...handle.receipt, state: "joined", outcome });
    if (!writePrivateJsonIfUnchanged(paths(handle.receipt.id, environment).file, next, { expectedCurrentContentSha256: handle.contentSha256 })) throw nativeCustodyUncertain();
  } catch { throw nativeCustodyUncertain(); }
}
/** Caller must separately prove the creating Bun incarnation is gone.
 * No receipt means no request was sent. A dead native PID cannot substitute for
 * a joined terminal reply: an unconfirmed write remains manual recovery work. */
export function assertNativeCreateSettled(identifier: string, environment: ControlEnvironment): void {
  try { const value = read(identifier, environment); if (value && value.receipt.state !== "joined") throw nativeCustodyUncertain(); }
  catch { throw nativeCustodyUncertain(); }
}
