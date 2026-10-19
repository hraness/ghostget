import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as manifest from "./manifest";

const native = { ...fs };
const nativeManifest = { ...manifest };
const manifestModule = join(import.meta.dir, "manifest");
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
};
const pathOf = (path: unknown) => typeof path === "string" ? path : "";

/** Exact private-path native holds; callers supply the existing archive fixtures. */
export async function observeTranscriptNativeFailure(
  mode: "write" | "hash",
  start: (root: string) => Promise<unknown>,
) {
  const root = await native.realpath(await native.mkdtemp(join(tmpdir(), "wrench-transcript-native-")));
  const entered = deferred(); const release = deferred(); const closed = deferred();
  const tasks: Promise<unknown>[] = []; const hashes: Promise<unknown>[] = [];
  const events: { name: string; pending: boolean; path?: string }[] = [];
  let pending = false; let heldRead = false; let hashClosed = false;
  let activeHashes = 0; let writes = 0; let lockPath: string | undefined; let stagingPath: string | undefined;
  const targeted = (value: unknown) => pathOf(value).startsWith(root + "/");
  const retain = <A>(task: Promise<A>) => { tasks.push(task); void task.then(() => undefined, () => undefined); return task; };
  const exists = async (path: string | undefined) => {
    if (path === undefined) throw new Error("Fixture missed the actual archive path");
    return native.lstat(path).then(() => true, (cause: unknown) => {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return false;
      throw cause;
    });
  };
  let outcome: Promise<{ ok: true; value: unknown } | { ok: false; cause: unknown }> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
  mock.module(manifestModule, () => ({
    ...nativeManifest,
    createMediaArtifact: (...args: Parameters<typeof manifest.createMediaArtifact>) => {
      const task = nativeManifest.createMediaArtifact(...args);
      if (targeted(args[0])) {
        hashes.push(task); activeHashes += 1;
        const settled = () => { activeHashes -= 1; events.push({ name: "hash-settled", pending, path: args[1] }); };
        void task.then(settled, settled);
      }
      return task;
    },
  }));
  mock.module("node:fs/promises", () => ({
    ...native,
    writeFile: (...args: Parameters<typeof fs.writeFile>) => {
      if (!targeted(args[0])) return native.writeFile(...args);
      const path = pathOf(args[0]);
      if (/\/data\/captions\/transcript\.(vtt|txt|json)$/.test(path)) {
        writes += 1; stagingPath = dirname(dirname(dirname(path)));
      }
      if (mode === "write" && path.endsWith("/data/captions/transcript.vtt")) {
        if (typeof args[1] !== "string") throw new Error("Transcript fixture payload changed");
        const bytes = Buffer.from(args[1]);
        async function* heldBytes() {
          yield bytes.subarray(0, 8);
          events.push({ name: "native-prefix-consumed", pending }); entered.resolve();
          await release.promise; yield bytes.subarray(8);
        }
        pending = true;
        return retain(native.writeFile(args[0], heldBytes(), args[2]).finally(() => {
          pending = false; events.push({ name: "native-write-settled", pending });
        }));
      }
      if (mode === "write" && path.endsWith("/data/captions/transcript.txt")) {
        return retain(entered.promise.then(() => { throw new Error("transcript sibling write failed"); }));
      }
      return retain(native.writeFile(...args));
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      const path = pathOf(args[0]);
      if (targeted(path) && path.endsWith(".lock")) lockPath = path;
      if (mode !== "hash" || !targeted(path)) return native.open(...args);
      if (path.endsWith("/data/captions/transcript.txt")) {
        await entered.promise; throw new Error("transcript sibling hash failed");
      }
      const handle = await native.open(...args);
      if (!path.endsWith("/data/captions/transcript.vtt")) return handle;
      return new Proxy(handle, { get(target, key) {
        if (key === "read") return (...readArgs: Parameters<typeof handle.read>) => {
          if (heldRead) return handle.read(...readArgs);
          heldRead = true; pending = true;
          events.push({ name: "native-descriptor-read-admitted", pending }); entered.resolve();
          return retain(release.promise.then(() => handle.read(...readArgs)));
        };
        if (key === "close") return async () => {
          try { await handle.close(); hashClosed = true; pending = false; events.push({ name: "native-descriptor-closed", pending }); }
          finally { closed.resolve(); }
        };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      } });
    },
    rename: (...args: Parameters<typeof fs.rename>) => {
      if (!targeted(args[0])) return native.rename(...args);
      const destination = pathOf(args[1]);
      const name = basename(destination).startsWith(".wrench-media-discard-") ? "quarantine"
        : destination.includes(".release-") ? "lock-release" : undefined;
      if (name !== undefined) events.push({ name: name + "-admitted", pending });
      return retain(native.rename(...args).then(() => { if (name !== undefined) events.push({ name: name + "-completed", pending }); }));
    },
  }));
    outcome = Promise.resolve().then(() => start(root)).then(
      value => ({ ok: true as const, value }), cause => ({ ok: false as const, cause }),
    );
    await Promise.race([
      entered.promise,
      outcome.then(() => { throw new Error("Archive settled before native hold admission"); }),
    ]);
    const early = await Promise.race([
      outcome.then(() => true),
      new Promise<false>(resolve => { timer = setTimeout(() => { resolve(false); }, 150); }),
    ]);
    clearTimeout(timer);
    const before = { early, pending, lockExists: await exists(lockPath), stagingExists: await exists(stagingPath) };
    release.resolve();
    const result = await outcome;
    await Promise.allSettled(tasks);
    await Promise.allSettled(hashes);
    if (heldRead) await closed.promise;
    const after = { pending, activeHashes, hashClosed, lockExists: await exists(lockPath), stagingExists: await exists(stagingPath) };
    return { before, after, result, events, writes };
  } finally {
    clearTimeout(timer); release.resolve();
    if (outcome !== undefined) await outcome;
    await Promise.allSettled(tasks); await Promise.allSettled(hashes);
    if (heldRead) await closed.promise;
    // Restore imported bindings only after every admitted helper's native finally.
    mock.module("node:fs/promises", () => native);
    mock.module(manifestModule, () => nativeManifest);
    if (pending || activeHashes !== 0 || (heldRead && !hashClosed)) {
      throw new Error("Transcript fixture native cleanup failed; temporary root retained");
    }
    await native.rm(root, { recursive: true, force: true });
  }
}
