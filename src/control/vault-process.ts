import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ghostgetStateHome } from "../storage";
import { readInterfaceJson } from "./interface-json";
import { ControlError, keys, record, string } from "./validation";
import type { ControlEnvironment } from "./web-policy";
import { captureProcessOwnerIdentity, type ProcessOwnerIdentity } from "../process-identity";
import { beginNativeCreate, finishNativeCreate, nativeCustodyUncertain, type NativeCreateHandle, type NativeCreateOutcome } from "./vault-custody";

const uncertain = () => new ControlError("VAULT_UNCERTAIN", "The credential operation could not be confirmed. Refresh the vault and review pending storage cleanup. Do not retry a request automatically.");
export function vaultEnvironment(environment: ControlEnvironment): Record<string, string> {
  const result: Record<string, string> = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: ghostgetStateHome(environment) };
  for (const name of ["HOME", "TMPDIR", "USER", "LOGNAME"] as const) if (environment[name] !== undefined) result[name] = environment[name];
  return result;
}
export interface VaultChild {
  readonly stdin: { write(value: string): unknown; end(): unknown };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  kill(signal: "SIGTERM" | "SIGKILL"): unknown;
}
/** Bounded private pipes, joined exit and output, and no raw subprocess diagnostics. */
export async function exchangeVault(child: VaultChild, request: unknown, signal?: AbortSignal, timeoutMs = 125_000, onJoined?: (value: unknown, exitCode: number) => void): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interrupt: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => { interrupt = () => reject(uncertain()); });
  const reader = child.stdout.getReader();
  const output = (async () => {
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 262144) throw uncertain(); chunks.push(next.value); }
      return readInterfaceJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 262144);
    } finally { reader.releaseLock(); }
  })();
  const send = Promise.resolve().then(async () => { signal?.throwIfAborted(); child.stdin.write(`${JSON.stringify(request)}\n`); await child.stdin.end(); });
  const joined = Promise.allSettled([output, child.exited, send]);
  const within = async (ms: number) => { let deadline: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([joined.then(() => true), new Promise<false>(resolve => { deadline = setTimeout(() => resolve(false), ms); })]); } finally { if (deadline) clearTimeout(deadline); } };
  signal?.addEventListener("abort", interrupt, { once: true });
  timer = setTimeout(interrupt, timeoutMs); if (signal?.aborted) interrupt();
  try {
    const [value, exitCode] = await Promise.race([Promise.all([output, child.exited, send]), interrupted]);
    onJoined?.(value, exitCode);
    const v = record(value);
    if (v.ok === true && exitCode === 0) return v;
    if (v.ok === false && exitCode === 1) {
      keys(v, ["ok", "code"]);
      const code = string(v.code, 64);
      // Only this code's categorical messages cross the boundary.
      const mapped = ({ CANCELLED: "VAULT_CANCELLED", UNAVAILABLE: "VAULT_UNAVAILABLE", EXISTS: "VAULT_UNCERTAIN", NOT_FOUND: "VAULT_NOT_FOUND", INVALID: "INVALID_REQUEST" } as Readonly<Record<string, string>>)[code] ?? code;
      const message = VAULT_MESSAGES[mapped];
      if (message) throw new ControlError(mapped, message);
    }
    throw uncertain();
  } catch (error) {
    if (error instanceof ControlError && error.code !== "VAULT_UNCERTAIN") throw error;
    try { child.kill("SIGTERM"); } catch { /* Already exited. */ }
    if (!await within(3000)) { try { child.kill("SIGKILL"); } catch { /* Already exited. */ } if (!await within(500)) {void reader.cancel().catch(() => undefined);throw new ControlError("VAULT_CUSTODY_UNCERTAIN",VAULT_MESSAGES.VAULT_CUSTODY_UNCERTAIN!);} }
    throw uncertain();
  } finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", interrupt); }
}

export const VAULT_MESSAGES: Readonly<Record<string, string>> = {
  VAULT_CAPACITY: "Vault metadata is full. Remove unused grants or items before adding more.",
  INVALID_REQUEST: "The vault request is invalid or exceeds its limits.",
  VAULT_CHANGED: "The vault or web policy changed. Refresh before trying again.",
  VAULT_LOCKED: "Unlock the vault in Ghostget before using a credential.",
  VAULT_UNAVAILABLE: "Secure credential storage is unavailable. Use the installed macOS app and check Keychain access.",
  VAULT_UNCERTAIN: "The credential operation could not be confirmed. Review pending storage cleanup before retrying.",
  VAULT_CUSTODY_UNCERTAIN: "Credential process completion is unconfirmed. Its pending record is retained. Restart Ghostget; if no completed native receipt can be recovered, inspect the Ghostget entry in macOS Keychain manually. Automatic cleanup cannot resolve an unknown outcome.",
  VAULT_STATE_UNAVAILABLE: "Vault metadata is unavailable. Credential use is blocked.",
  VAULT_CANCELLED: "Secret entry was cancelled. No credential was granted.",
  VAULT_NOT_FOUND: "The selected credential, connection or grant is unavailable.",
  VAULT_SCOPE: "Use a service account restricted to the single dedicated 1Password vault, with Read Items only.",
  VAULT_PROVIDER_UNAVAILABLE: "1Password could not resolve the selected field. Check the service account, shared vault and item reference.",
  VAULT_SECRET_INVALID: "The selected field is empty or is not valid for this credential type.",
  CREDENTIAL_DENIED: "This credential use is denied or expired. Review its grant in Ghostget.",
  CREDENTIAL_RESPONSE_BLOCKED: "The response did not match the approved fields or could disclose credential material. No response fields were returned.",
  CREDENTIAL_REQUEST_FAILED: "The authenticated request failed. It may have reached the endpoint; do not retry automatically.",
};

export async function runVaultHelper(request: unknown, environment: ControlEnvironment, signal?: AbortSignal): Promise<unknown> {
  if (process.platform !== "darwin" || basename(process.execPath) !== "ghostget-bun") throw new ControlError("VAULT_UNAVAILABLE", VAULT_MESSAGES.VAULT_UNAVAILABLE!);
  const script = fileURLToPath(new URL("./vault-helper.ts", import.meta.url));
  const child = Bun.spawn([join(dirname(process.execPath), "ghostget-credential-bun"), "--no-env-file", "--no-install", script], { cwd: dirname(script), env: vaultEnvironment(environment), stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  return await exchangeVault(child, request, signal);
}

export type SecretPurpose = "credential" | "1password-bootstrap";
export interface SecretStorePort {
  create(id: string, purpose: SecretPurpose, kind: "password" | "token", signal?: AbortSignal): Promise<void>;
  read(id: string, purpose: SecretPurpose, signal?: AbortSignal): Promise<string>;
  delete(id: string, purpose: SecretPurpose, signal?: AbortSignal): Promise<void>;
}

/** No request has been sent. Closing stdin and joining this child cannot create a secret. */
async function stopBeforeInput(child: VaultChild): Promise<void> {
  const closed = Promise.resolve().then(() => child.stdin.end());
  const drained = child.stdout.pipeTo(new WritableStream<Uint8Array>({ write() { /* Discard categorical output; never log it. */ } }));
  const joined = Promise.allSettled([closed, drained, child.exited]);
  const wait = async (ms: number) => { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([joined.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), ms); })]); } finally { if (timer) clearTimeout(timer); } };
  try { child.kill("SIGTERM"); } catch { /* Exit may win the race. */ }
  if (!await wait(3000)) { try { child.kill("SIGKILL"); } catch { /* Exit may win the race. */ } if (!await wait(500)) throw nativeCustodyUncertain(); }
}
function terminalNativeCreate(value: unknown, exitCode: number): NativeCreateOutcome {
  try {
    const v = record(value);
    if (v.ok === true && exitCode === 0) { keys(v, ["ok"]); return "SUCCESS"; }
    if (v.ok === false && exitCode === 1) {
      keys(v, ["ok", "code"]);
      if (typeof v.code === "string" && ["CANCELLED", "UNAVAILABLE", "EXISTS", "NOT_FOUND", "INVALID"].includes(v.code)) return v.code as NativeCreateOutcome;
    }
    throw nativeCustodyUncertain();
  } catch { throw nativeCustodyUncertain(); }
}
/** Store custody before dispatch. The injected capture is for synthetic process tests only. */
export async function exchangeNativeCreate(child: VaultChild & { readonly pid: number }, request: { readonly id: string; readonly purpose: SecretPurpose; readonly kind: "password" | "token" }, environment: ControlEnvironment, signal?: AbortSignal, captureOwner: (pid: number) => ProcessOwnerIdentity = captureProcessOwnerIdentity): Promise<unknown> {
  let creation: NativeCreateHandle;
  try { signal?.throwIfAborted(); creation = beginNativeCreate(request.id, request.purpose, captureOwner(child.pid), environment); }
  catch { await stopBeforeInput(child); throw nativeCustodyUncertain(); }
  return await exchangeVault(child, { protocol: "ghostget.secret-store/1", action: "create", ...request }, signal, 125_000, (value, exitCode) => finishNativeCreate(creation, terminalNativeCreate(value, exitCode), environment));
}
/** Only the isolated credential executable can call this private native mode. */
export function nativeSecretStore(environment: ControlEnvironment): SecretStorePort {
  const call = async (action: "create" | "read" | "delete", id: string, purpose: SecretPurpose, kind?: "password" | "token", signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (process.platform !== "darwin" || basename(process.execPath) !== "ghostget-credential-bun") throw new ControlError("VAULT_UNAVAILABLE", VAULT_MESSAGES.VAULT_UNAVAILABLE!);
    const executable = join(dirname(process.execPath), "../../MacOS/ghostget-desktop");
    const child = Bun.spawn([executable, "--vault-stdio"], { env: vaultEnvironment(environment), stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    // Native codes have their own strict mapping, never an arbitrary message.
    let result: unknown;
    try { result = action === "create" ? await exchangeNativeCreate(child, { id, purpose, kind: kind! }, environment, signal) : await exchangeVault(child, { protocol: "ghostget.secret-store/1", action, purpose, id }, signal); }
    catch (error) { throw error; }
    const v = record(result); keys(v, action === "read" ? ["ok", "value"] : ["ok"]);
    if(action!=="read")return undefined;
    if(typeof v.value!=="string"||!v.value.length||Buffer.byteLength(v.value)>16384||v.value.includes("\0"))throw uncertain();
    return v.value;
  };
  return {
    async create(id, purpose, kind, signal) { await call("create", id, purpose, kind, signal); },
    async read(id, purpose, signal) { return (await call("read", id, purpose, undefined, signal))!; },
    async delete(id, purpose, signal) { await call("delete", id, purpose, undefined, signal); },
  };
}
