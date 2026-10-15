import type { Readable } from "node:stream";
import { APP_HOST_MAX_FRAME_BYTES, APP_HOST_PROTOCOL, type AppHostData, type AppHostRequest, type AppHostResponse } from "./app-host-protocol";
import { parseAppHostFrame } from "./app-host-validation";
import { ControlError } from "./control/validation";

type Service = { handle: (request: AppHostRequest) => Promise<AppHostData>; close: () => void };

export function appHostFailure(id: string, error: unknown): AppHostResponse {
  return { protocol: APP_HOST_PROTOCOL, id, ok: false,
    code: error instanceof ControlError ? error.code : "HOST_FAILURE",
    message: error instanceof ControlError ? error.message : "GhostGet could not complete the request. Reopen the connection settings and retry." };
}

/** Bounded, protocol-only stdio. EOF aborts owned work before relinquishing custody. */
export async function serveAppHost(input: Readable, write: (line: string) => void, service: Service, signal?: AbortSignal): Promise<void> {
  const active = new Set<Promise<void>>();
  const usedIds = new Set<string>();
  let buffered = Buffer.alloc(0);
  let stopped = false;
  let outputOpen = true;
  const stop = (): void => { stopped = true; service.close(); input.destroy(); };
  const emit = (response: AppHostResponse): void => {
    if (!outputOpen) return;
    const line = `${JSON.stringify(response)}\n`;
    const output = Buffer.byteLength(line) <= APP_HOST_MAX_FRAME_BYTES ? line
      : `${JSON.stringify(appHostFailure(response.id, new ControlError("RESPONSE_TOO_LARGE", "The response exceeds this app host's limit.")))}\n`;
    try { write(output); }
    catch { outputOpen = false; stop(); }
  };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  const receive = (line: Buffer): void => {
    let id = "invalid";
    try {
      if (line.length > APP_HOST_MAX_FRAME_BYTES) throw new ControlError("INVALID_REQUEST", "The request exceeds its frame limit.");
      const frame = parseAppHostFrame(new TextDecoder("utf-8", { fatal: true }).decode(line));
      id = frame.id;
      if (usedIds.has(id)) throw new ControlError("DUPLICATE_REQUEST", "Use a new request ID for each operation.");
      if (usedIds.size >= 4096) { emit(appHostFailure(id, new ControlError("SESSION_LIMIT", "Reopen the app host before sending more requests."))); stop(); return; }
      usedIds.add(id);
      if (active.size >= 8 && frame.request.action !== "close" && frame.request.action !== "connection.cancel") {
        throw new ControlError("HOST_BUSY", "The app host has too many active requests.");
      }
      const operation = (async (): Promise<void> => {
        try {
          const data = await service.handle(frame.request);
          emit({ protocol: APP_HOST_PROTOCOL, id: frame.id, ok: true, data });
          if (frame.request.action === "close") stop();
        } catch (error) { emit(appHostFailure(frame.id, error)); }
      })();
      active.add(operation);
      // Observe both outcomes: a discarded rejecting `finally` promise would
      // outlive the drain and become an unhandled rejection during shutdown.
      void operation.then(() => active.delete(operation), () => active.delete(operation));
    } catch (error) {
      emit(appHostFailure(id, error instanceof ControlError ? error : new ControlError("INVALID_REQUEST", "The request is malformed or unsupported.")));
    }
  };
  try {
    for await (const chunk of input) {
      if (stopped) break;
      buffered = Buffer.concat([buffered, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)]);
      let newline: number;
      while (!stopped && (newline = buffered.indexOf(10)) >= 0) {
        receive(buffered.subarray(0, newline));
        buffered = buffered.subarray(newline + 1);
      }
      if (buffered.length > APP_HOST_MAX_FRAME_BYTES) {
        emit(appHostFailure("invalid", new ControlError("INVALID_REQUEST", "The request exceeds its frame limit.")));
        stop();
      }
    }
    if (!stopped && buffered.length > 0) emit(appHostFailure("invalid", new ControlError("INVALID_REQUEST", "The last request was incomplete.")));
  } catch {
    if (!stopped) emit(appHostFailure("invalid", new ControlError("TRANSPORT_CLOSED", "The app host input closed unexpectedly.")));
  } finally {
    service.close();
    await Promise.allSettled(active);
    signal?.removeEventListener("abort", stop);
  }
}
