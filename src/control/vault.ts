import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ghostgetStateHome } from "../storage";
import type { ControlRequest } from "./protocol";
import { ControlError } from "./validation";
import { readInterfaceJson } from "./interface-json";
import type { VaultImportCode, VaultImportResult } from "./credential-helper";

const MESSAGES: Readonly<Record<VaultImportCode, string>> = {
  INVALID_IMPORT: "Use an exact 1Password field reference, X user ID, and supported declared scopes and expiry.",
  ACCOUNT_CHANGED: "The account changed during import. Refresh before starting another import.",
  VAULT_UNAVAILABLE: "1Password did not provide the token. Unlock the selected account and approve desktop access.",
  TOKEN_UNVERIFIED: "The token could not prove the expected X account. Use an OAuth 2.0 user-context access token.",
  IMPORT_CANCELLED: "Token import was cancelled before the account was connected.",
  IMPORT_FAILED: "Token import failed before the account was connected.",
  IMPORT_UNCERTAIN: "Import or cleanup could not be confirmed. Refresh Accounts before retrying; private recovery evidence was retained.",
};

export function parseCredentialResult(text: string): VaultImportResult {
  let value: unknown;
  try { value = readInterfaceJson(text, 1024); } catch { throw new Error("invalid credential response"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid credential response");
  const record = value as Record<string, unknown>;
  if (record.ok === true && Object.keys(record).length === 1) return { ok: true };
  if (record.ok === false && Object.keys(record).length === 2 && typeof record.code === "string" && Object.hasOwn(MESSAGES, record.code)) return { ok: false, code: record.code as VaultImportCode };
  throw new Error("invalid credential response");
}

/** No vault value travels through control IPC, argv, environment or the agent socket. */
export async function importVaultToken(request: Extract<ControlRequest, { action: "vault.import" }>, environment: Readonly<Record<string, string | undefined>>, signal?: AbortSignal): Promise<void> {
  if (process.platform !== "darwin") throw new ControlError("VAULT_UNAVAILABLE", "1Password desktop token import currently requires macOS.");
  if (signal?.aborted) throw new ControlError("IMPORT_CANCELLED", MESSAGES.IMPORT_CANCELLED);
  const launch = credentialProcessSpec(environment);
  const child = Bun.spawn(launch.command, { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: launch.environment, cwd: launch.cwd });
  await exchangeCredentialRequest(child, request, signal);
}

/** Fixed production code and environment, with no caller-controlled runtime selector. */
export function credentialProcessSpec(environment: Readonly<Record<string, string | undefined>>): { command: string[]; cwd: string; environment: Record<string, string> } {
  const executable = basename(process.execPath) === "ghostget-bun" ? join(dirname(process.execPath), "ghostget-credential-bun") : process.execPath;
  const script = fileURLToPath(new URL("./credential-helper.ts", import.meta.url));
  const childEnvironment: Record<string, string> = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: ghostgetStateHome(environment) };
  for (const key of ["HOME", "TMPDIR", "USER", "LOGNAME"] as const) if (environment[key] !== undefined) childEnvironment[key] = environment[key];
  return { command: [executable, "--no-env-file", "--no-install", script], cwd: dirname(script), environment: childEnvironment };
}

export type CredentialProcess = {
  readonly stdin: { write(value: string): unknown; end(): unknown };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly kill: (signal: "SIGTERM" | "SIGKILL") => unknown;
};

/** A lost response or an unjoined helper is always uncertain, never retried. */
export async function exchangeCredentialRequest(child: CredentialProcess, request: unknown, signal?: AbortSignal, timeoutMs = 122_000): Promise<void> {
  const reader = child.stdout.getReader();
  let interrupt: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => { interrupt = () => reject(new Error()); });
  signal?.addEventListener("abort", interrupt, { once: true });
  const timer = setTimeout(interrupt, timeoutMs);
  if (signal?.aborted) interrupt();
  const kill = (value: "SIGTERM" | "SIGKILL") => { try { child.kill(value); } catch { /* Exit may win the race. */ } };
  const read = async (): Promise<string> => {
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 1024) throw new Error();
        chunks.push(next.value);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } finally { reader.releaseLock(); }
  };
  const output = read();
  const send = Promise.resolve().then(async () => {
    child.stdin.write(`${JSON.stringify(request)}\n`);
    await child.stdin.end();
  });
  const joined = Promise.allSettled([output, child.exited, send]);
  try {
    // Always join both output and process exit; an exit without a valid receipt is uncertain.
    const [text, exitCode] = await Promise.race([Promise.all([output, child.exited, send]), interrupted]);
    const result = parseCredentialResult(text);
    if (result.ok && exitCode === 0) return;
    if (!result.ok && exitCode === 1) throw new ControlError(result.code, MESSAGES[result.code]);
    throw new Error();
  } catch (error) {
    if (error instanceof ControlError) throw error;
    kill("SIGTERM");
    if (!await settledWithin(joined, 1000)) {
      kill("SIGKILL");
      if (!await settledWithin(joined, 500)) void reader.cancel().catch(() => undefined);
    }
    throw new ControlError("IMPORT_UNCERTAIN", MESSAGES.IMPORT_UNCERTAIN);
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", interrupt);
  }
}

async function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise.then(() => true, () => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), ms); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
