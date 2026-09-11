import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ControlError } from "./validation";
import { readInterfaceJson } from "./interface-json";
import { parseBrowserProfiles } from "./setup-model";
import type { DiscoveryScan } from "./discovery-reader";
import type { ControlEnvironment } from "./web-policy";

export interface DiscoveryChild {
  readonly stdin: { write(value: string): unknown; end(): unknown };
  readonly stdout: ReadableStream<Uint8Array>; readonly exited: Promise<number>;
  kill(signal: "SIGTERM" | "SIGKILL"): unknown;
}
const unavailable = () => new ControlError("DISCOVERY_UNAVAILABLE", "Browser hints are unavailable. Choose a profile manually and verify the account.");
/** Keep stdin open: EOF tells the separate watchdog that its controlling app died. */
export async function exchangeDiscovery(child: DiscoveryChild, signal?: AbortSignal, timeoutMs = 25_000): Promise<DiscoveryScan> {
  const reader = child.stdout.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
  let interrupt: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => { interrupt = () => reject(unavailable()); });
  const output = (async () => { const chunks: Uint8Array[] = []; let bytes = 0; try { for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 16384) throw unavailable(); chunks.push(next.value); } return readInterfaceJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 16384); } finally { reader.releaseLock(); } })();
  const send = Promise.resolve().then(() => { signal?.throwIfAborted(); child.stdin.write('{"protocol":"ghostget.discovery/1","action":"scan"}\n'); });
  const joined = Promise.allSettled([output, child.exited, send]);
  const within = async (ms: number): Promise<boolean> => { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([joined.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), ms); })]); } finally { if (timer) clearTimeout(timer); } };
  signal?.addEventListener("abort", interrupt, { once: true }); timer = setTimeout(interrupt, timeoutMs); if (signal?.aborted) interrupt();
  try {
    const [value, exit] = await Promise.race([Promise.all([output, child.exited, send]), cancelled]);
    if (exit !== 0 || !value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
    const result = value as Record<string, unknown>;
    if (Object.keys(result).sort().join(",") !== "ok,profiles,status" || result.ok !== true || result.status !== "ready" && result.status !== "unavailable") throw unavailable();
    return { status: result.status, profiles: parseBrowserProfiles(result.profiles) };
  } catch (error) {
    try { child.stdin.end(); } catch { /* The watchdog may already have closed. */ }
    try { child.kill("SIGTERM"); } catch { /* Already exited. */ }
    if (!await within(500)) { try { child.kill("SIGKILL"); } catch { /* Already exited. */ } if (!await within(500)) { void reader.cancel().catch(() => undefined); throw new ControlError("DISCOVERY_CUSTODY_UNCERTAIN", "Browser discovery could not stop safely. It is disabled until the app restarts."); } }
    throw error instanceof ControlError ? error : unavailable();
  } finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", interrupt); try { child.stdin.end(); } catch { /* Closed process. */ } }
}
export async function runDiscovery(environment: ControlEnvironment, signal?: AbortSignal): Promise<DiscoveryScan> {
  if (process.platform !== "darwin") return { status: "unavailable", profiles: [] };
  const script = fileURLToPath(new URL("./discovery-helper.ts", import.meta.url));
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", script], { cwd: dirname(script), env: { PATH: "/usr/bin:/bin", HOME: environment.HOME ?? "" }, stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  return await exchangeDiscovery(child, signal);
}
