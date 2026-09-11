import { Database } from "bun:sqlite";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, type Stats } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { isMainThread, parentPort } from "node:worker_threads";
import type { BrowserCandidate, BrowserProfileView } from "./setup-model";

export interface DiscoveryScan { readonly status: "ready" | "unavailable"; readonly profiles: readonly BrowserProfileView[] }
const same = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
function absent(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
function directory(path: string, uid: number): Stats {
  const value = lstatSync(path);
  if (!value.isDirectory() || value.uid !== uid || (value.mode & 0o022) !== 0 || realpathSync(path) !== path) throw new Error("Unsafe browser directory");
  return value;
}
function inactiveSidecars(path: string, uid: number): string {
  return ["-wal", "-journal"].map(suffix => {
    try { const s = lstatSync(`${path}${suffix}`); if (!s.isFile() || s.uid !== uid || s.nlink !== 1 || s.size !== 0) throw new Error("Browser database is active"); return `${s.dev}:${s.ino}:${s.ctimeMs}:${s.mtimeMs}`; }
    catch (error) { if (absent(error)) return "absent"; throw error; }
  }).join("|");
}
/** Read a stable main-file snapshot, never SQLite-open or write the browser store. */
export function cookieMetadataCandidates(path: string, uid: number, now: number): readonly BrowserCandidate[] {
  const before = lstatSync(path);
  if (!before.isFile() || before.uid !== uid || before.nlink !== 1 || (before.mode & 0o022) !== 0 || before.size < 100 || before.size > 32 * 1024 * 1024) throw new Error("Unavailable browser database");
  const sidecars = inactiveSidecars(path, uid); const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const bytes = Buffer.alloc(before.size); let db: Database | undefined;
  try {
    if (!same(before, fstatSync(fd))) throw new Error("Changed browser database");
    let offset = 0; while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) throw new Error("Incomplete browser database"); offset += count; }
    if (!same(before, fstatSync(fd)) || !same(before, lstatSync(path)) || inactiveSidecars(path, uid) !== sidecars) throw new Error("Changed browser database");
    if (bytes.subarray(0, 16).toString("binary") !== "SQLite format 3\0" || ![1, 2].includes(bytes[18]!) || ![1, 2].includes(bytes[19]!)) throw new Error("Invalid browser database");
    // SQLite documents this for an in-memory deserialization of a stable, WAL-free snapshot.
    // No browser file is modified. https://sqlite.org/c3ref/deserialize.html
    bytes[18] = 1; bytes[19] = 1;
    db = Database.deserialize(bytes, { readonly: true, strict: true });
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA query_only=ON; PRAGMA temp_store=MEMORY; PRAGMA busy_timeout=0;");
    const table = db.query("SELECT type, sql FROM sqlite_schema WHERE name = 'cookies'").get() as { type?: unknown; sql?: unknown } | null;
    if (table?.type !== "table" || typeof table.sql !== "string" || !/^CREATE\s+TABLE\b/iu.test(table.sql)) throw new Error("Unsupported cookie schema");
    const columns = db.query("PRAGMA table_xinfo(cookies)").all() as { name: string; type: string; hidden: number }[];
    for (const [name, type] of [["host_key", "TEXT"], ["name", "TEXT"], ["expires_utc", "INTEGER"]]) if (!columns.some(column => column.name === name && column.type.toUpperCase() === type && column.hidden === 0)) throw new Error("Unsupported cookie metadata");
    const present = db.query("SELECT EXISTS(SELECT 1 FROM cookies WHERE host_key IN (?1, ?2) AND name = ?3 AND (expires_utc = 0 OR expires_utc > ?4) LIMIT 1) AS present");
    const epoch = (now + 11_644_473_600_000) * 1000;
    const has = (domain: string, name: string): boolean => {
      const result = present.get(domain, `.${domain}`, name, epoch) as { present: unknown };
      if (result.present !== 0 && result.present !== 1) throw new Error("Invalid cookie metadata result"); return result.present === 1;
    };
    const result: BrowserCandidate[] = [];
    if (has("x.com", "auth_token") && has("x.com", "ct0") || has("twitter.com", "auth_token") && has("twitter.com", "ct0")) result.push("x-web");
    if (has("linkedin.com", "li_at")) result.push("linkedin-web");
    if (has("reddit.com", "reddit_session")) result.push("reddit-web");
    if (!same(before, fstatSync(fd)) || !same(before, lstatSync(path)) || inactiveSidecars(path, uid) !== sidecars) throw new Error("Changed browser database");
    return result;
  } finally { try { db?.close(); } finally { bytes.fill(0); closeSync(fd); } }
}
/** Fixed Chrome layout only; no display names, emails, value extraction, or supplied paths. */
export function scanBrowserMetadata(home: string, platform = process.platform, uid = process.getuid?.()): DiscoveryScan {
  if (platform !== "darwin" || uid === undefined) return { status: "unavailable", profiles: [] };
  try {
    if (!isAbsolute(home) || normalize(home) !== home || home === "/" || home.includes("\0")) throw new Error("Invalid home");
    const homeIdentity = directory(home, uid); const root = join(home, "Library", "Application Support", "Google", "Chrome");
    const anchors = [join(home, "Library"), join(home, "Library", "Application Support"), join(home, "Library", "Application Support", "Google"), root];
    const identities = anchors.map(path => directory(path, uid));
    const entries = readdirSync(root, { withFileTypes: true }); if (entries.length > 256) throw new Error("Too many browser entries");
    const names = entries.filter(entry => /^(?:Default|Profile [1-9][0-9]{0,2})$/u.test(entry.name)).map(entry => entry.name).sort((a, b) => a === "Default" ? -1 : b === "Default" ? 1 : Number(a.slice(8)) - Number(b.slice(8)));
    if (names.length > 16) throw new Error("Too many browser profiles");
    let status: DiscoveryScan["status"] = "ready";
    const profiles = names.map(profile => {
      const path = join(root, profile); const identity = directory(path, uid); let candidates: readonly BrowserCandidate[] = [];
      try {
        const legacy = join(path, "Cookies"); const network = join(path, "Network"); let database: string | null = null; let networkIdentity: Stats | null = null;
        try { lstatSync(legacy); database = legacy; } catch (error) { if (!absent(error)) throw error; }
        try { networkIdentity = directory(network, uid); const candidate = join(network, "Cookies"); try { lstatSync(candidate); if (database !== null) throw new Error("Ambiguous cookie stores"); database = candidate; } catch (error) { if (!absent(error)) throw error; } } catch (error) { if (!absent(error)) throw error; }
        if (database !== null) candidates = cookieMetadataCandidates(database, uid, Date.now());
        if (networkIdentity !== null && !same(networkIdentity, directory(network, uid))) throw new Error("Changed browser directory");
      } catch { status = "unavailable"; candidates = []; }
      if (!same(identity, directory(path, uid))) throw new Error("Changed browser profile");
      return { id: `chrome-${profile.toLowerCase().replace(" ", "-")}`, browser: "chrome" as const, profile, label: `Chrome · ${profile}`, candidates };
    });
    if (!same(homeIdentity, directory(home, uid)) || anchors.some((path, index) => !same(identities[index]!, directory(path, uid)))) throw new Error("Changed browser root");
    return { status, profiles };
  } catch { return { status: "unavailable", profiles: [] }; }
}
if (!isMainThread) {
  const result = scanBrowserMetadata(process.env.HOME ?? "");
  parentPort?.postMessage(result);
}
