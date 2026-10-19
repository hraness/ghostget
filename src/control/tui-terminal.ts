import { StringDecoder } from "node:string_decoder";

export type TuiKey = "up" | "down" | "left" | "right" | "tab" | "backtab" | "enter" | "escape" | "interrupt" | "backspace" | "pageup" | "pagedown" | "home" | "end" | { readonly text: string };

/** Decode the finite key vocabulary without treating pasted content as commands.
 * Partial escape sequences and paste markers may cross arbitrary stream chunks. */
export class TuiInput {
  private readonly utf8 = new StringDecoder("utf8");
  private buffer = "";
  private paste = false;
  feed(chunk: string | Uint8Array): TuiKey[] {
    const text = typeof chunk === "string" ? chunk : this.utf8.write(Buffer.from(chunk));
    // Large paste bursts are discarded, never replayed as command keys.
    if (text.length > 65_536) {
      const discarded = this.buffer + text;
      const start = discarded.lastIndexOf("\x1b[200~");
      const end = discarded.lastIndexOf("\x1b[201~");
      if (start > end) this.paste = true;
      else if (end >= 0) this.paste = false;
      this.buffer = this.paste ? discarded.slice(-5) : "";
      return [];
    }
    this.buffer += text;
    const keys: TuiKey[] = [];
    while (this.buffer.length > 0 && keys.length < 256) {
      if (this.paste) {
        const end = this.buffer.indexOf("\x1b[201~");
        if (end < 0) { this.buffer = this.buffer.slice(-5); break; }
        this.buffer = this.buffer.slice(end + 6); this.paste = false; continue;
      }
      if (this.buffer.startsWith("\x1b[200~")) { this.buffer = this.buffer.slice(6); this.paste = true; continue; }
      if (this.buffer[0] === "\x1b") {
        if (["\x1b[200~", "\x1b[201~"].some((marker) => marker.startsWith(this.buffer))) break;
        if (this.buffer.startsWith("\x1bO")) {
          if (this.buffer.length < 3) break;
          const key = ({ A: "up", B: "down", C: "right", D: "left", H: "home", F: "end" } as const)[this.buffer[2] as "A"];
          if (key !== undefined) keys.push(key);
          this.buffer = this.buffer.slice(3); continue;
        }
        if (this.buffer.startsWith("\x1b[")) {
          const sequence = /^\x1b\[[0-?]*[ -/]*[@-~]/u.exec(this.buffer)?.[0];
          if (sequence === undefined) { if (this.buffer.length > 64) this.buffer = ""; break; }
          const key = ({ "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[Z": "backtab", "\x1b[5~": "pageup", "\x1b[6~": "pagedown", "\x1b[H": "home", "\x1b[F": "end", "\x1b[1~": "home", "\x1b[4~": "end" } as const)[sequence as "\x1b[A"];
          if (key !== undefined) keys.push(key);
          this.buffer = this.buffer.slice(sequence.length); continue;
        }
        // Unknown escape input is discarded as a unit, not a shortcut prefix.
        this.buffer = ""; break;
      }
      const character = String.fromCodePoint(this.buffer.codePointAt(0)!);
      this.buffer = this.buffer.slice(character.length);
      const key = ({ "\x03": "interrupt", "\x04": "interrupt", "\t": "tab", "\r": "enter", "\n": "enter", "\x7f": "backspace", "\b": "backspace" } as const)[character as "\r"];
      if (key !== undefined) keys.push(key);
      else if (!/[\p{Cc}\p{Cf}]/u.test(character)) keys.push({ text: character });
    }
    if (keys.length === 256) this.buffer = "";
    // A terminal without bracketed-paste support sends clipboard text as a
    // burst. Such a burst must not navigate, confirm, then execute in one read.
    // Keep repeated navigation responsive; command text/Enter needs a distinct
    // input event. Bracketed paste is discarded above regardless of chunking.
    if (keys.length > 1 && keys.some((key) => typeof key === "object" || key === "enter")) return [];
    return keys;
  }
  flushEscape(): TuiKey[] {
    if (this.buffer === "\x1b" && !this.paste) { this.buffer = ""; return ["escape"]; }
    return [];
  }
}

export interface TuiTerminal {
  readonly isTerminal: boolean;
  readonly wasRaw: boolean;
  size(): { readonly columns: number; readonly rows: number };
  write(text: string): unknown;
  setRawMode(enabled: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  onData(handler: (chunk: string | Uint8Array) => void): () => void;
  onResize(handler: () => void): () => void;
  onSignal(handler: () => void): () => void;
}

export function processTerminal(write: (text: string) => unknown): TuiTerminal {
  return {
    isTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
    wasRaw: process.stdin.isRaw === true,
    size: () => ({ columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 }),
    write,
    setRawMode: (enabled) => process.stdin.setRawMode(enabled),
    resume: () => process.stdin.resume(),
    pause: () => process.stdin.pause(),
    onData: (handler) => { process.stdin.on("data", handler); return () => { process.stdin.removeListener("data", handler); }; },
    onResize: (handler) => { process.stdout.on("resize", handler); return () => { process.stdout.removeListener("resize", handler); }; },
    onSignal: (handler) => {
      process.on("SIGINT", handler); process.on("SIGTERM", handler); process.stdin.on("end", handler); process.stdin.on("error", handler); process.stdout.on("error", handler);
      return () => { process.removeListener("SIGINT", handler); process.removeListener("SIGTERM", handler); process.stdin.removeListener("end", handler); process.stdin.removeListener("error", handler); process.stdout.removeListener("error", handler); };
    },
  };
}

/** Own terminal modes for exactly this lifetime, including setup/draw failures. */
export async function withTuiTerminal(terminal: TuiTerminal, work: () => Promise<void>): Promise<void> {
  let raw = false;
  let entered = false;
  try {
    terminal.setRawMode(true); raw = true;
    entered = true;
    terminal.write("\x1b[?1049h\x1b[?25l\x1b[?2004h");
    terminal.resume();
    await work();
  } finally {
    try { if (entered) terminal.write("\x1b[?2004l\x1b[?25h\x1b[0m\x1b[?1049l"); }
    finally { try { if (raw) terminal.setRawMode(terminal.wasRaw); } finally { terminal.pause(); } }
  }
}
