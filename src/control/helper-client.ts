import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROL_PROTOCOL, type ControlRequest, type ControlResponse } from "./protocol";
import type { ControlEnvironment } from "./web-policy";
import { assertControlData } from "./control-response";

const MAX_FRAME = 4_194_304;
const HELPER_TIMEOUT_MS = 15_000;

/** Pipe reads may split or coalesce messages. Apply the wire bound to each
 * frame and the unfinished tail, never to the aggregate read chunk. */
export function decodeHelperFrames(bytes: Buffer): { readonly frames: readonly ReturnType<typeof parseHelperEnvelope>[]; readonly remainder: Buffer } {
  const frames: ReturnType<typeof parseHelperEnvelope>[] = [];
  let offset = 0;
  for (;;) {
    const end = bytes.indexOf(10, offset);
    if (end < 0) break;
    if (end - offset > MAX_FRAME) throw new Error("oversized helper response");
    frames.push(parseHelperEnvelope(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, end))));
    offset = end + 1;
  }
  if (bytes.length - offset > MAX_FRAME) throw new Error("oversized helper response");
  return { frames, remainder: Buffer.from(bytes.subarray(offset)) };
}

/** Bounded administrative client over the helper's private stdio channel. The
 * menu companion owns the helper process; agent requests stay on the socket. */
export interface HelperClient {
  request(request: ControlRequest, timeoutMs?: number): Promise<ControlResponse>;
  /** End administrative input, then await cancellation and owned work settlement.
   * Request deadlines do not authorize detaching or killing credential work. */
  close(): void | Promise<void>;
}
export function spawnHelper(environment: ControlEnvironment): HelperClient {
  const script = fileURLToPath(new URL("./helper.ts", import.meta.url));
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [key, value] of Object.entries(environment)) if (value !== undefined) env[key] = value;
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", script], { cwd: dirname(script), env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const pending = new Map<string, { resolve: (response: ControlResponse) => void; timer: ReturnType<typeof setTimeout> }>();
  let buffer = Buffer.alloc(0);
  let closed = false;
  // Drain diagnostics without accumulating or disclosing third-party output.
  void (async () => { for await (const _chunk of child.stderr) { /* discard */ } })().catch(() => undefined);
  const settle = (response: ControlResponse | null): void => {
    const slots = [...pending.values()]; pending.clear();
    for (const slot of slots) {
      clearTimeout(slot.timer);
      slot.resolve(response ?? { ok: false, code: "CONTROL_DISCONNECTED", message: "The Ghostget control helper disconnected." });
    }
  };
  const read = (async () => {
    const reader = child.stdout.getReader();
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        const decoded = decodeHelperFrames(Buffer.concat([buffer, next.value]));
        buffer = decoded.remainder;
        for (const frame of decoded.frames) {
          const id = typeof frame.id === "string" ? frame.id : null;
          if (id === null || frame.protocol !== CONTROL_PROTOCOL) continue;
          if (id === "helper" && frame.ok === false) {
            closed = true;
            settle(frame);
            continue;
          }
          const slot = pending.get(id); if (slot === undefined) continue;
          pending.delete(id); clearTimeout(slot.timer);
          slot.resolve(frame as unknown as ControlResponse);
        }
      }
    } catch { /* a dead or oversized channel degrades the menu, it never retries */ }
    finally { closed = true; settle(null); try { child.stdin.end(); } catch { /* already closed */ } }
  })();
  void read;
  // Exit may arrive before the final stdout frame. Drain the receipt before
  // converting unanswered requests into a generic disconnect.
  void child.exited.then(async () => { await read; closed = true; settle(null); });
  return {
    request: (request, timeoutMs = HELPER_TIMEOUT_MS) => new Promise<ControlResponse>((resolve) => {
      if (closed) { resolve({ ok: false, code: "CONTROL_DISCONNECTED", message: "The Ghostget control helper is not running. Close this controller and reopen it." }); return; }
      if (pending.size >= 8) { resolve({ ok: false, code: "CONTROL_BUSY", message: "Wait for the current control request to finish." }); return; }
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 150_000) { resolve({ ok: false, code: "INVALID_REQUEST", message: "The control request deadline is invalid." }); return; }
      const id = randomUUID();
      const line = `${JSON.stringify({ id, protocol: CONTROL_PROTOCOL, request })}\n`;
      if (Buffer.byteLength(line) > MAX_FRAME) { resolve({ ok: false, code: "INVALID_REQUEST", message: "The control request exceeds its size limit." }); return; }
      const timer = setTimeout(() => {
        pending.delete(id);
        closed = true;
        try { child.stdin.end(); } catch { /* already closed */ }
        resolve({ ok: false, code: "CONTROL_TIMEOUT", message: "The control request did not finish in time. Its outcome may be uncertain. Refresh state before starting another action; do not retry it automatically." });
        settle(null);
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      try { child.stdin.write(line); }
      catch { pending.delete(id); clearTimeout(timer); resolve({ ok: false, code: "CONTROL_DISCONNECTED", message: "The Ghostget control helper disconnected." }); }
    }),
    close: async () => { closed = true; try { child.stdin.end(); } catch { /* already closed */ } await child.exited; await read; },
  };
}

/** Reject a malformed helper envelope before it can become a displayed result.
 * The helper produces typed data after parsing every administrative request. */
export function parseHelperEnvelope(text: string): ControlResponse & { readonly id: string; readonly protocol: typeof CONTROL_PROTOCOL } {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid helper response");
  const frame = value as Record<string, unknown>;
  if (frame.protocol !== CONTROL_PROTOCOL || typeof frame.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(frame.id)) throw new Error("invalid helper identity");
  const allowed = frame.ok === true ? ["id", "protocol", "ok", "data"] : ["id", "protocol", "ok", "code", "message"];
  if (Object.keys(frame).length !== allowed.length || allowed.some(key => !Object.hasOwn(frame, key))) throw new Error("invalid helper fields");
  if (frame.ok === false) {
    if (typeof frame.code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/u.test(frame.code) || typeof frame.message !== "string" || frame.message.length > 4096) throw new Error("invalid helper error");
    if (frame.code === "CONTROL_ALREADY_RUNNING") frame.message = "Another Ghostget controller is open. Run ghostget menubar stop or quit the other TUI, then reopen this controller.";
  } else if (frame.ok === true) {
    assertControlData(frame.data);
  } else throw new Error("invalid helper result");
  return frame as unknown as ControlResponse & { readonly id: string; readonly protocol: typeof CONTROL_PROTOCOL };
}
