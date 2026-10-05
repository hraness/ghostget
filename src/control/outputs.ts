import { lstatSync, readdirSync, type BigIntStats } from "node:fs";
import { join } from "node:path";

/** Bounded, read-only view of the product outputs directory shared by
 * `ghostget status` and `ghostget outputs`. */
const OUTPUTS_LIMIT = 12;
const OUTPUTS_SCAN_BOUND = 512;
export interface OutputEntry {
  readonly name: string;
  readonly size: number;
  readonly modifiedMs: number;
  readonly identity: { readonly dev: bigint; readonly ino: bigint; readonly size: bigint; readonly mtimeNs: bigint; readonly mode: bigint };
}
export interface OutputsView {
  readonly directory: { readonly dev: bigint; readonly ino: bigint } | null;
  readonly entries: readonly OutputEntry[];
  readonly message: string | null;
  readonly truncated: boolean;
}
export const EMPTY_OUTPUTS: OutputsView = { directory: null, entries: [], message: null, truncated: false };
const UNAVAILABLE_OUTPUTS: OutputsView = { directory: null, entries: [], message: "No outputs yet", truncated: false };

/** Bounded newest-first listing of the product outputs directory. Reads never
 * create the directory and never follow symlinks; entries must be regular
 * files owned by the current user without group or other write bits. */
export function readOutputs(directory: string): OutputsView {
  const uid = process.getuid?.();
  const dirInfo = (() => { try { return lstatSync(directory, { bigint: true }); } catch { return null; } })();
  if (dirInfo === null || uid === undefined || !dirInfo.isDirectory() || dirInfo.isSymbolicLink() || dirInfo.uid !== BigInt(uid) || (dirInfo.mode & 0o777n) !== 0o700n) return UNAVAILABLE_OUTPUTS;
  const entry = (name: string): OutputEntry | null => {
    if (name.startsWith(".") || name.includes("/") || name.includes("\u0000")) return null;
    let info: BigIntStats;
    try { info = lstatSync(join(directory, name), { bigint: true }); } catch { return null; }
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== BigInt(uid) || (info.mode & 0o022n) !== 0n) return null;
    return { name, size: Number(info.size), modifiedMs: Number(info.mtimeMs), identity: { dev: info.dev, ino: info.ino, size: info.size, mtimeNs: info.mtimeNs, mode: info.mode } };
  };
  let names: readonly string[];
  try { names = readdirSync(directory).slice(0, OUTPUTS_SCAN_BOUND); } catch { return UNAVAILABLE_OUTPUTS; }
  const entries = names.flatMap((name) => { const found = entry(name); return found === null ? [] : [found]; });
  const truncated = names.length === OUTPUTS_SCAN_BOUND || entries.length > OUTPUTS_LIMIT;
  entries.sort((a, b) => b.identity.mtimeNs === a.identity.mtimeNs ? a.name.localeCompare(b.name) : b.identity.mtimeNs > a.identity.mtimeNs ? 1 : -1);
  return { directory: { dev: dirInfo.dev, ino: dirInfo.ino }, entries: entries.slice(0, OUTPUTS_LIMIT), message: entries.length === 0 ? "No output files" : null, truncated };
}

