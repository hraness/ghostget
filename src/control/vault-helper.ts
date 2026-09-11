import { executeCredential, credentialTransport } from "./credential-executor";
import { readInterfaceJson } from "./interface-json";
import { nativeSecretStore, VAULT_MESSAGES } from "./vault-process";
import { manageVault, onePasswordSource, resolveVaultItem } from "./vault-runtime";
import { parseVaultControlRequest, VaultStore, vaultId } from "./vault-store";
import { ControlError, digest, keys, record } from "./validation";
import { captureProcessOwnerIdentity, processOwnerStatus } from "../process-identity";

export async function runVaultWorker(value: unknown, signal: AbortSignal): Promise<unknown> {
  const request = record(value);
  const secrets = nativeSecretStore(process.env);
  if (request.action === "manage") {
    keys(request, ["action", "request"]);
    await manageVault(parseVaultControlRequest(request.request), new VaultStore(process.env), secrets, onePasswordSource, signal);
    return { ok: true };
  }
  keys(request, ["action", "grantId", "digest", "id"]);
  if (request.action !== "use") throw new ControlError("INVALID_REQUEST", "Invalid request.");
  return await executeCredential(vaultId(request.grantId), digest(request.digest), vaultId(request.id), process.env, signal, { transport: credentialTransport, resolve: (item, state, signal) => resolveVaultItem(item, state, secrets, onePasswordSource, signal) });
}
if (import.meta.main) {
  // Third-party SDK diagnostics are suppressed before its lazy import. Only
  // explicitly constructed categorical/filtered results can leave stdout.
  for (const name of Object.getOwnPropertyNames(console)) if (typeof (console as unknown as Record<string, unknown>)[name] === "function") Object.defineProperty(console, name, { value: () => undefined, configurable: true });
  process.umask(0o077);
  const controller = new AbortController();
  const stop = () => controller.abort(); process.once("SIGTERM", stop); process.once("SIGINT", stop);
  const timer = setTimeout(stop, 120_000);
  const watchdog = setTimeout(() => process.exit(1), 123_000); watchdog.unref();
  let ownerTimer:ReturnType<typeof setInterval>|undefined;
  try {
    const parent=captureProcessOwnerIdentity(process.ppid);
    ownerTimer=setInterval(()=>{try{if(process.ppid!==parent.pid||processOwnerStatus(parent)!=="exact-live-owner")stop();}catch{stop();}},200);
    const chunks: Uint8Array[] = []; let bytes = 0;
    for await (const chunk of process.stdin) { controller.signal.throwIfAborted(); const buffer = Buffer.from(chunk); bytes += buffer.byteLength; if (bytes > 16384) throw new Error(); chunks.push(buffer); }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const result = await runVaultWorker(readInterfaceJson(text, 16384), controller.signal);
    controller.signal.throwIfAborted();
    await Bun.write(Bun.stdout, `${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof ControlError && Object.hasOwn(VAULT_MESSAGES, error.code) ? error.code : controller.signal.aborted ? "VAULT_UNCERTAIN" : "VAULT_UNAVAILABLE";
    await Bun.write(Bun.stdout, `${JSON.stringify({ ok: false, code })}\n`); process.exitCode = 1;
  } finally { clearTimeout(timer); clearTimeout(watchdog); if(ownerTimer)clearInterval(ownerTimer);process.off("SIGTERM", stop); process.off("SIGINT", stop); }
  process.exit(process.exitCode ?? 0);
}
