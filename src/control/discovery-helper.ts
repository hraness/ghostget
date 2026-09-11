import { Worker } from "node:worker_threads";
import { parseBrowserProfiles } from "./setup-model";

/** A responsive watchdog owns the synchronous scanner thread and the parent pipe. */
export async function runDiscoveryHelper(createWorker: () => Worker = () => new Worker(new URL("./discovery-reader.ts", import.meta.url)), timeoutMs = 20_000): Promise<void> {
  let worker: Worker | null = null; let started = false; let buffer = Buffer.alloc(0);
  const fail = () => process.exit(1);
  const deadline = setTimeout(fail, timeoutMs);
  process.once("SIGTERM", fail); process.once("SIGINT", fail); process.stdin.once("end", fail); process.stdin.once("error", fail);
  process.stdin.on("data", (chunk: Buffer) => {
    if (started) fail(); buffer = Buffer.concat([buffer, chunk]); if (buffer.length > 128) fail();
    const newline = buffer.indexOf(10); if (newline < 0) return;
    if (buffer.toString("utf8") !== '{"protocol":"ghostget.discovery/1","action":"scan"}\n') fail();
    started = true;
    worker = createWorker();
    let replied = false;
    worker.once("error", fail); worker.once("exit", () => { if (!replied) fail(); });
    worker.on("message", (value: unknown) => {
      try {
        if (replied || !value || typeof value !== "object" || Array.isArray(value)) fail();
        const result = value as Record<string, unknown>;
        if (Object.keys(result).sort().join(",") !== "profiles,status" || result.status !== "ready" && result.status !== "unavailable") fail();
        const profiles = parseBrowserProfiles(result.profiles); replied = true;
        const output = `${JSON.stringify({ ok: true, status: result.status, profiles })}\n`; if (Buffer.byteLength(output) > 16384) fail();
        void worker!.terminate().then(() => { process.stdout.write(output, () => { clearTimeout(deadline); process.exit(0); }); }, fail);
      } catch { fail(); }
    });
  });
}
if (import.meta.main) await runDiscoveryHelper();
