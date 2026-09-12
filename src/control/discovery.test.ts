import { afterEach, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserDiscovery } from "./discovery";
import { cookieMetadataCandidates, scanBrowserMetadata, type DiscoveryScan } from "./discovery-reader";
import { ControlError } from "./validation";

const roots: string[] = []; afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() { const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-discovery-test-"))); chmodSync(root, 0o700); roots.push(root); const home = join(root, "home"); const profile = join(home, "Library", "Application Support", "Google", "Chrome", "Default"); mkdirSync(profile, { recursive: true, mode: 0o700 }); return { root, home, profile, environment: { HOME: home, GHOSTGET_STATE_HOME: join(root, "state") } }; }
function cookies(path: string) { const db = new Database(path); db.exec("CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER, value TEXT, encrypted_value BLOB)"); const insert = db.prepare("INSERT INTO cookies VALUES (?, ?, ?, ?, ?)"); for (const [host, name, expires] of [[".x.com", "auth_token", 0], [".x.com", "ct0", 0], [".linkedin.com", "li_at", 0], [".reddit.com", "reddit_session", 1], [".example.com", "other", 0]]) insert.run(host as string, name as string, expires as number, "SYNTHETIC_VALUE_NEVER_RETURNED", Buffer.from("SYNTHETIC_ENCRYPTED_BYTES")); db.close(); chmodSync(path, 0o600); }
const found: DiscoveryScan = { status: "ready", profiles: [{ id: "chrome-default", browser: "chrome", profile: "Default", label: "Chrome · Default", candidates: ["x-web"] }] };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("fixed cookie metadata hints never disclose values or modify the browser database", () => {
  const f = fixture(); const path = join(f.profile, "Cookies"); cookies(path);
  const before = readFileSync(path); const names = readdirSync(f.profile);
  const result = scanBrowserMetadata(f.home, "darwin", process.getuid!());
  expect(result).toEqual({ status: "ready", profiles: [{ ...found.profiles[0]!, candidates: ["x-web", "linkedin-web"] }] });
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC"); expect(JSON.stringify(result)).not.toContain(f.home);
  expect(readFileSync(path)).toEqual(before); expect(readdirSync(f.profile)).toEqual(names);
  // A WAL-mode main file with no active log can be safely deserialized in memory.
  const walHeader = Buffer.from(before); walHeader[18] = 2; walHeader[19] = 2; writeFileSync(path, walHeader);
  expect(cookieMetadataCandidates(path, process.getuid!(), Date.now())).toEqual(["x-web", "linkedin-web"]);
  expect(readFileSync(path)).toEqual(walHeader); expect(readdirSync(f.profile)).toEqual(names);
});
test("active logs, unsafe stores, ambiguous stores and schema drift remain unknown", () => {
  const f = fixture(); const path = join(f.profile, "Cookies"); cookies(path);
  writeFileSync(`${path}-wal`, "active", { mode: 0o600 });
  expect(scanBrowserMetadata(f.home, "darwin", process.getuid!())).toEqual({ status: "unavailable", profiles: [{ ...found.profiles[0]!, candidates: [] }] });
  rmSync(`${path}-wal`); writeFileSync(`${path}-journal`, "active", { mode: 0o600 });
  expect(() => cookieMetadataCandidates(path, process.getuid!(), Date.now())).toThrow("active"); rmSync(`${path}-journal`);
  mkdirSync(join(f.profile, "Network"), { mode: 0o700 }); cookies(join(f.profile, "Network", "Cookies"));
  expect(scanBrowserMetadata(f.home, "darwin", process.getuid!()).status).toBe("unavailable"); rmSync(join(f.profile, "Network"), { recursive: true });
  chmodSync(path, 0o666); expect(() => cookieMetadataCandidates(path, process.getuid!(), Date.now())).toThrow(); chmodSync(path, 0o600);
  const target = join(f.root, "other.sqlite"); cookies(target); rmSync(path); symlinkSync(target, path);
  expect(scanBrowserMetadata(f.home, "darwin", process.getuid!()).profiles[0]!.candidates).toEqual([]); rmSync(path);
  const db = new Database(path); db.exec("CREATE VIEW cookies AS SELECT 'x.com' AS host_key, 'auth_token' AS name, 0 AS expires_utc"); db.close(); chmodSync(path, 0o600);
  expect(() => cookieMetadataCandidates(path, process.getuid!(), Date.now())).toThrow("schema");
  expect(scanBrowserMetadata(f.home, "linux", process.getuid!())).toEqual({ status: "unavailable", profiles: [] });
});
test("a Network directory that becomes unsafe during the snapshot cannot retain session hints", () => {
  const f = fixture(); const network = join(f.profile, "Network"); mkdirSync(network, { mode: 0o700 }); cookies(join(network, "Cookies"));
  const deserialize = Database.deserialize.bind(Database);
  const changed = spyOn(Database, "deserialize").mockImplementation((bytes, options) => { const database = typeof options === "boolean" ? deserialize(bytes, options) : deserialize(bytes, options); chmodSync(network, 0o777); return database; });
  try {
    expect(scanBrowserMetadata(f.home, "darwin", process.getuid!())).toEqual({ status: "unavailable", profiles: [{ ...found.profiles[0]!, candidates: [] }] });
    expect(changed).toHaveBeenCalledTimes(1);
  } finally { changed.mockRestore(); chmodSync(network, 0o700); }
});
test("discovery is opt-in, snapshots never scan, and cached hints expire without rescanning", async () => {
  const f = fixture(); let calls = 0; let now = 0;
  const discovery = new BrowserDiscovery(f.environment, async () => { calls++; return found; }, () => now);
  expect(discovery.view()).toEqual({ revision: 0, enabled: false, status: "not-scanned", scannedAt: null, profiles: [] });
  expect(readdirSync(f.root)).toEqual(["home"]);
  await expect(discovery.refresh(0)).rejects.toThrow("Enable"); expect(calls).toBe(0);
  await discovery.configure(true, 0); expect(calls).toBe(1); expect(discovery.view().profiles).toEqual(found.profiles);
  discovery.view(); discovery.view(); expect(calls).toBe(1);
  const reopened = new BrowserDiscovery(f.environment, async () => { throw new Error("snapshot must not scan"); });
  expect(reopened.view()).toMatchObject({ enabled: true, status: "not-scanned", profiles: [] }); reopened.close();
  now = 300000; expect(discovery.view().status).toBe("not-scanned"); expect(calls).toBe(1);
  await expect(discovery.configure(false, 0)).rejects.toThrow("changed");
  await discovery.configure(false, 1); expect(discovery.view()).toMatchObject({ revision: 2, enabled: false, profiles: [] }); discovery.close();
});
test("opt-out clears hints immediately and ABA consent cannot publish an earlier scan", async () => {
  const f = fixture(); const first = deferred<DiscoveryScan>(); const second = deferred<DiscoveryScan>(); const started = deferred<void>(); let calls = 0; let oldSignal: AbortSignal | null = null;
  const discovery = new BrowserDiscovery(f.environment, async (_, signal) => { calls++; if (calls === 1) { oldSignal = signal; started.resolve(); return first.promise; } return second.promise; });
  const enable = discovery.configure(true, 0).catch(error => error); await started.promise;
  const disable = discovery.configure(false, 1); expect(oldSignal!.aborted).toBe(true); expect(discovery.view()).toMatchObject({ revision: 2, enabled: false, profiles: [] });
  const reenable = discovery.configure(true, 2); first.resolve(found); await enable; await disable;
  expect(discovery.view()).toMatchObject({ revision: 3, enabled: true, profiles: [] });
  second.resolve({ status: "ready", profiles: [] }); await reenable; expect(calls).toBe(2); expect(discovery.view().profiles).toEqual([]); discovery.close();
});
test("unjoined discovery poisons the slot while revocation remains available", async () => {
  const f = fixture(); let calls = 0; const discovery = new BrowserDiscovery(f.environment, async () => { calls++; throw new ControlError("DISCOVERY_CUSTODY_UNCERTAIN", "Synthetic unjoined worker"); });
  await expect(discovery.configure(true, 0)).rejects.toThrow("Synthetic");
  await expect(discovery.refresh(1)).rejects.toThrow("Restart");
  await expect(discovery.configure(false, 1)).rejects.toThrow("Synthetic");
  expect(discovery.view()).toMatchObject({ enabled: false, profiles: [] });
  await expect(discovery.configure(true, 2)).rejects.toThrow("Restart"); expect(calls).toBe(1); discovery.close();
});
