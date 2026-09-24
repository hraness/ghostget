import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import fc from "fast-check";
import { parseReleaseManifest, releaseAssetNames, type ReleaseManifest } from "../website/github-release-artifact.mjs";
import { downloadReleaseAsset, publishCanonicalRelease } from "./github-release-publish.js";
import { assertAsyncProperty } from "../src/test-support.js";

// Stateful model of the canonical GitHub publisher. Every generated schedule
// drives the production publishCanonicalRelease, and its production byte-bounded
// asset downloader, against one fake GitHub repository that keeps releases,
// drafts, stored asset bytes, Latest, and main across invocations. Commands are
// publication attempts (with lookup, inventory, authority, and write faults),
// a later stable Release, a front-run draft or Release, and stored-byte
// corruption. After every command the model checks the publisher's safety laws
// against what the fake repository actually saw, and a fault-free invocation
// from a resumable state must succeed. GitHub is assumed to behave as the fake
// does: drafts are invisible to the by-tag endpoint, a published tag is unique,
// and `gh release upload` resolves a tag to its published Release or else the
// newest draft carrying it.

const repository = "hraness/ghostget";
const prefix = `/repos/${repository}`;
const tag = "v0.17.0";
const higherTag = "v0.17.1";
const sourceSha = "a".repeat(40);
const workflowSha = "b".repeat(40);
const names = releaseAssetNames(tag);
const BOT = Object.freeze({ id: 41898282, type: "Bot" });
const OWNER = Object.freeze({ id: 894119, type: "User" });
const PREDECESSOR_ID = 99;

const attemptKeys = ["R1", "R2", "R3", "F1"] as const;
type AttemptKey = typeof attemptKeys[number];
const attemptCoordinates: Record<AttemptKey, { runId: number; runAttempt: number }> = {
  R1: { runId: 9001, runAttempt: 1 }, R2: { runId: 9001, runAttempt: 2 },
  R3: { runId: 9001, runAttempt: 3 }, F1: { runId: 9002, runAttempt: 1 },
};
const bodyFor = (runId: number, runAttempt: number): string =>
  `wrench-release-source-v1 repository=${repository} tag=${tag} source_sha=${sourceSha} workflow_run_id=${runId}`
  + `\n\nghostget-release-attempt-v1 run_attempt=${runAttempt}`;

type Attempt = Readonly<{ key: AttemptKey; directory: string; manifest: ReleaseManifest; body: string; files: ReadonlyMap<string, Buffer> }>;

type StoredAsset = { id: number; name: string; bytes: Buffer; state: "uploaded" | "starter"; corrupt: boolean };
type StoredRelease = {
  id: number; tag: string; draft: boolean; immutable: boolean; body: string; target: string; name: string;
  author: { id: number; type: string }; assets: StoredAsset[]; publishedAt: string | null; untagged: string;
};
type World = {
  releases: StoredRelease[]; latestId: number; mainSha: string; nextId: number; nextAssetId: number; clock: number;
};

type LookupFault = "lookup-500" | "lookup-403" | "lookup-status-mismatch" | "lookup-malformed"
  | "lookup-wrong-404-body" | "inventory-error";
type Fault =
  | { kind: "none" }
  | { kind: LookupFault }
  | { kind: "crash-before" | "lost-after" | "starter"; at: number }
  | { kind: "authority-drift" | "main-advances" | "concurrent-higher"; at: number };

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const stableOrder = (value: string): number[] => value.slice(1).split(".").map(Number);
const newer = (left: string, right: string): boolean => {
  const a = stableOrder(left); const b = stableOrder(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index]! > b[index]!;
  return false;
};
const timestamp = (clock: number): string => new Date(Date.UTC(2026, 8, 9, 1, 0, clock)).toISOString().replace(".000Z", "Z");

function assetJson(release: StoredRelease, asset: StoredAsset): Record<string, unknown> {
  return {
    id: asset.id, name: asset.name, size: asset.bytes.length, digest: `sha256:${sha256(asset.bytes)}`, state: asset.state,
    browser_download_url: release.draft
      ? `https://github.com/${repository}/releases/download/untagged-${release.untagged}/${asset.name}`
      : `https://github.com/${repository}/releases/download/${release.tag}/${asset.name}`,
    url: `https://api.github.com${prefix}/releases/assets/${asset.id}`,
  };
}
function releaseJson(release: StoredRelease): Record<string, unknown> {
  return {
    id: release.id, tag_name: release.tag, target_commitish: release.target, name: release.name, body: release.body,
    draft: release.draft, prerelease: false, immutable: release.immutable, author: { ...release.author },
    published_at: release.publishedAt, assets: release.assets.map(asset => assetJson(release, asset)),
  };
}
const snapshot = (release: StoredRelease): string => JSON.stringify({ ...releaseJson(release),
  stored: release.assets.map(asset => [asset.id, sha256(asset.bytes), asset.corrupt, asset.state]) });

function initialWorld(): World {
  const predecessor: StoredRelease = { id: PREDECESSOR_ID, tag: "v0.16.11", draft: false, immutable: true, body: "historical",
    target: "c".repeat(40), name: "Ghostget v0.16.11", author: BOT, assets: [], publishedAt: "2026-09-08T01:00:00Z",
    untagged: "0".repeat(20) };
  return { releases: [predecessor], latestId: PREDECESSOR_ID, mainSha: workflowSha, nextId: 100, nextAssetId: 1000, clock: 0 };
}

type Write = { kind: "create" | "upload" | "publish"; releaseId: number };
type Outcome = { error: unknown; writes: Write[]; violations: string[]; downloadsSinceLastWrite: Set<number>; lookupExact404: boolean };

// One publisher invocation against the shared world. Laws that must hold at the
// instant of each write are checked inside the fake and recorded as violations.
async function invoke(world: World, attempt: Attempt, fault: Fault): Promise<Outcome> {
  const violations: string[] = []; const writes: Write[] = [];
  let downloadsSinceLastWrite = new Set<number>();
  let lastCall: { authorityOk: boolean; main: string } | undefined;
  let lookupExact404 = false; let authorityCalls = 0; let mainReads = 0; let writeCount = 0;
  // The most recent complete inventory read, and whether it followed this invocation's last write.
  let lastScanSawHigher = false; let scanSinceLastWrite = false;
  const byTagPublished = (): StoredRelease | undefined => world.releases.find(release => release.tag === tag && !release.draft);
  const higherPublished = (): boolean => world.releases.some(release => !release.draft && newer(release.tag, tag));
  const ours = (release: StoredRelease): boolean => release.draft && release.tag === tag && release.body === attempt.body
    && release.author.id === BOT.id && release.author.type === BOT.type && release.target === sourceSha;
  const precededByAuthority = (label: string): void => {
    if (lastCall === undefined || !lastCall.authorityOk || lastCall.main !== world.mainSha) {
      violations.push(`${label} was not immediately preceded by a successful prewrite authority proof on current main`);
    }
  };
  // Decide whether the next write applies, crashes before applying, or loses its response.
  const writeFault = (upload: boolean): "apply" | "crash" | "lost" | "starter" => {
    writeCount += 1;
    if ((fault.kind === "crash-before" || fault.kind === "lost-after" || fault.kind === "starter") && fault.at === writeCount) {
      if (fault.kind === "crash-before") return "crash";
      if (fault.kind === "starter") return upload ? "starter" : "crash";
      return "lost";
    }
    return "apply";
  };
  const recordWrite = (write: Write): void => { writes.push(write); downloadsSinceLastWrite = new Set(); scanSinceLastWrite = false; };
  // GitHub has no conditional create or publish, so a Release that completes after
  // the census read and before the write is outside this law; the terminal
  // postcondition below covers it.
  const censusPrecedes = (label: string): void => {
    if (!scanSinceLastWrite || lastScanSawHigher) violations.push(`${label} without a clean completed-Release census since the last write`);
  };
  const ok = (value: unknown): { status: number; stdout: string } => ({ status: 0, stdout: JSON.stringify(value) });
  const notFound = { status: 1, stdout: JSON.stringify({ message: "Not Found" }) };

  const run = (args: readonly string[], input?: string): { status: number; stdout: string } => {
    const result = dispatch(args, input);
    lastCall = args[0] === "node" ? { authorityOk: result.status === 0 && args[3] === "publication-prewrite", main: String(args[6]) }
      : { authorityOk: false, main: "" };
    return result;
  };
  const dispatch = (args: readonly string[], input?: string): { status: number; stdout: string } => {
    if (args[0] === "node") {
      authorityCalls += 1;
      if (args.length !== 7 || args[1] !== "--experimental-strip-types" || args[2] !== "./scripts/release-ref-authority.ts"
        || (args[3] !== "publication-prewrite" && args[3] !== "publication-postwrite") || args[4] !== tag || args[5] !== sourceSha) {
        violations.push(`unexpected authority invocation ${args.join(" ")}`);
        return { status: 1, stdout: "" };
      }
      if (fault.kind === "authority-drift" && fault.at === authorityCalls) return { status: 1, stdout: "" };
      if (args[6] !== world.mainSha) return { status: 1, stdout: "" };
      return { status: 0, stdout: `sha=${sourceSha}\ntag=${tag}\nmain_sha=${world.mainSha}\n` };
    }
    if (args[0] !== "gh") { violations.push(`unexpected command ${args.join(" ")}`); return { status: 1, stdout: "" }; }
    if (args[1] === "release" && args[2] === "upload") {
      const path = String(args[4]); const name = basename(path);
      if (args.length !== 7 || args[3] !== tag || args[5] !== "--repo" || args[6] !== repository
        || dirname(path) !== attempt.directory || !names.includes(name)) {
        violations.push(`unexpected upload ${args.join(" ")}`);
        return { status: 1, stdout: "" };
      }
      precededByAuthority(`upload ${name}`);
      // gh resolves a tag to its published Release, or else the newest draft carrying it.
      const target = byTagPublished() ?? [...world.releases].sort((a, b) => b.id - a.id)
        .find(release => release.draft && release.tag === tag);
      if (target === undefined) { violations.push("upload without a release"); return { status: 1, stdout: "" }; }
      if (!ours(target)) violations.push(`upload ${name} reached release ${target.id}, which is not this attempt's draft`);
      if (!target.draft) { violations.push(`upload ${name} reached a published release`); return { status: 1, stdout: "" }; }
      if (target.assets.some(asset => asset.name === name)) {
        violations.push(`upload ${name} would clobber an existing asset`);
        return { status: 1, stdout: "" };
      }
      const bytes = readFileSync(path);
      if (!bytes.equals(attempt.files.get(name)!)) violations.push(`upload ${name} carries bytes other than the verified local file`);
      const outcome = writeFault(true);
      if (outcome === "crash") return { status: 1, stdout: "" };
      target.assets.push({ id: world.nextAssetId++, name, bytes, state: outcome === "starter" ? "starter" : "uploaded", corrupt: false });
      recordWrite({ kind: "upload", releaseId: target.id });
      return outcome === "apply" ? { status: 0, stdout: "" } : { status: 1, stdout: "" };
    }
    if (args[1] !== "api") { violations.push(`unexpected gh command ${args.join(" ")}`); return { status: 1, stdout: "" }; }
    if (args[2] === "--include") {
      if (args.length !== 4 || args[3] !== `${prefix}/releases/tags/${tag}`) {
        violations.push(`unexpected included read ${args.join(" ")}`);
        return { status: 1, stdout: "" };
      }
      const found = byTagPublished();
      const status = found === undefined ? "404" : "200";
      const payload = found === undefined ? { message: "Not Found" } : releaseJson(found);
      switch (fault.kind) {
        case "lookup-500": return { status: 1, stdout: `HTTP/2 500\n\n${JSON.stringify({ message: "Server Error" })}` };
        case "lookup-403": return { status: 1, stdout: `HTTP/2 403\n\n${JSON.stringify({ message: "Forbidden" })}` };
        case "lookup-status-mismatch": return { status: found === undefined ? 0 : 1, stdout: `HTTP/2 ${status}\n\n${JSON.stringify(payload)}` };
        case "lookup-malformed": return { status: 1, stdout: "HTTP/2 404 Not Found" };
        case "lookup-wrong-404-body": return { status: 1, stdout: `HTTP/2 404\n\n${JSON.stringify({ message: "Moved Permanently" })}` };
        default:
          lookupExact404 = found === undefined;
          return { status: found === undefined ? 1 : 0, stdout: `HTTP/2 ${status}\n\n${JSON.stringify(payload)}` };
      }
    }
    const method = args[2] === "--method" ? args[3] : undefined; const endpoint = String(args[4]);
    if (method === "GET" && args.length === 5) {
      const page = /^\/repos\/hraness\/ghostget\/releases\?per_page=100&page=([1-9][0-9]*)$/u.exec(endpoint);
      if (page !== null) {
        if (fault.kind === "inventory-error") return { status: 1, stdout: "" };
        const start = (Number(page[1]) - 1) * 100;
        if (page[1] === "1") { lastScanSawHigher = higherPublished(); scanSinceLastWrite = true; }
        return ok([...world.releases].sort((a, b) => b.id - a.id).slice(start, start + 100).map(releaseJson));
      }
      if (endpoint === `${prefix}/git/ref/heads/main`) {
        mainReads += 1; const current = world.mainSha;
        if (fault.kind === "main-advances" && fault.at === mainReads) world.mainSha = `${world.mainSha.slice(1)}${mainReads % 10}`;
        // A later stable Release completes while this invocation is between reads;
        // the ref-authority helper admits a higher raw tag, so only the census sees it.
        if (fault.kind === "concurrent-higher" && fault.at === mainReads) publishHigher(world, "published-not-latest");
        return ok({ ref: "refs/heads/main", object: { type: "commit", sha: current } });
      }
      if (endpoint === `${prefix}/releases/latest`) return ok(releaseJson(world.releases.find(release => release.id === world.latestId)!));
      if (endpoint === `${prefix}/releases/tags/${tag}`) { const found = byTagPublished(); return found === undefined ? notFound : ok(releaseJson(found)); }
      const byId = /^\/repos\/hraness\/ghostget\/releases\/([1-9][0-9]*)$/u.exec(endpoint);
      if (byId !== null) {
        const found = world.releases.find(release => release.id === Number(byId[1]));
        return found === undefined ? notFound : ok(releaseJson(found));
      }
      violations.push(`unexpected read ${endpoint}`);
      return { status: 1, stdout: "" };
    }
    if (method === "POST" && endpoint === `${prefix}/releases` && args.length === 7 && args[5] === "--input" && args[6] === "-") {
      precededByAuthority("draft creation");
      if (!lookupExact404) violations.push("draft created without an exact authenticated 404 by tag");
      if (world.releases.some(release => release.tag === tag)) violations.push("draft created while a release already claims the tag");
      censusPrecedes("draft creation");
      const request = JSON.parse(input ?? "null") as unknown;
      const expected = { tag_name: tag, target_commitish: sourceSha, name: `Ghostget ${tag}`, body: attempt.body,
        draft: true, prerelease: false, make_latest: "false" };
      if (JSON.stringify(request) !== JSON.stringify(expected)) violations.push(`draft creation body is not exact: ${input}`);
      if (byTagPublished() !== undefined) return { status: 1, stdout: JSON.stringify({ message: "Validation Failed" }) };
      const outcome = writeFault(false);
      if (outcome === "crash") return { status: 1, stdout: "" };
      const created: StoredRelease = { id: world.nextId++, tag, draft: true, immutable: false, body: attempt.body, target: sourceSha,
        name: `Ghostget ${tag}`, author: { ...BOT }, assets: [], publishedAt: null,
        untagged: sha256(Buffer.from(String(world.nextId))).slice(0, 20) };
      world.releases.push(created);
      recordWrite({ kind: "create", releaseId: created.id });
      return outcome === "apply" ? ok(releaseJson(created)) : { status: 1, stdout: "" };
    }
    const patch = /^\/repos\/hraness\/ghostget\/releases\/([1-9][0-9]*)$/u.exec(endpoint);
    if (method === "PATCH" && patch !== null && args.length === 7 && args[5] === "--input" && args[6] === "-") {
      precededByAuthority("publication");
      const target = world.releases.find(release => release.id === Number(patch[1]));
      if (JSON.stringify(JSON.parse(input ?? "null")) !== JSON.stringify({ draft: false, make_latest: "true" })) {
        violations.push(`publication PATCH body is not exact: ${input}`);
      }
      if (target === undefined) { violations.push("publication PATCH names no release"); return notFound; }
      if (!target.draft) { violations.push(`second publication PATCH for release ${target.id}`); return { status: 1, stdout: "" }; }
      if (!ours(target)) violations.push(`publication PATCH reached release ${target.id}, which is not this attempt's draft`);
      censusPrecedes("publication PATCH");
      const inventory = target.assets.map(asset => asset.name).sort();
      if (JSON.stringify(inventory) !== JSON.stringify([...names].sort())) violations.push("publication PATCH before the complete five-file inventory");
      for (const asset of target.assets) {
        if (asset.state !== "uploaded" || asset.corrupt || !asset.bytes.equals(attempt.files.get(asset.name) ?? Buffer.alloc(0))) {
          violations.push(`publication PATCH with asset ${asset.name} differing from the verified local bytes`);
        }
        if (!downloadsSinceLastWrite.has(asset.id)) violations.push(`publication PATCH without a fresh byte readback of ${asset.name}`);
      }
      if (byTagPublished() !== undefined) return { status: 1, stdout: JSON.stringify({ message: "Validation Failed" }) };
      const outcome = writeFault(false);
      if (outcome === "crash") return { status: 1, stdout: "" };
      world.clock += 1;
      Object.assign(target, { draft: false, immutable: true, publishedAt: timestamp(world.clock) });
      world.latestId = target.id;
      recordWrite({ kind: "publish", releaseId: target.id });
      return outcome === "apply" ? ok(releaseJson(target)) : { status: 1, stdout: "" };
    }
    violations.push(`unexpected API call ${args.join(" ")}`);
    return { status: 1, stdout: "" };
  };
  const binary = (args: readonly string[], maximumBytes: number): { status: number; stdout: Uint8Array } => {
    const match = /^\/repos\/hraness\/ghostget\/releases\/assets\/([1-9][0-9]*)$/u.exec(String(args[3]));
    const asset = match === null ? undefined : world.releases.flatMap(release => release.assets).find(item => item.id === Number(match[1]));
    if (asset === undefined || args.length !== 6 || args[0] !== "api" || args[5] !== "Accept: application/octet-stream") {
      violations.push(`unexpected asset download ${args.join(" ")}`);
      return { status: 1, stdout: new Uint8Array() };
    }
    if (maximumBytes !== asset.bytes.length + 1) violations.push(`asset ${asset.name} download is not bounded to its admitted size`);
    downloadsSinceLastWrite.add(asset.id);
    const bytes = Buffer.from(asset.bytes);
    if (asset.corrupt) bytes[0] = bytes[0]! ^ 0xff;
    return { status: 0, stdout: bytes };
  };
  let error: unknown;
  try {
    await publishCanonicalRelease(attempt.directory, attempt.manifest, run, (asset, current) => downloadReleaseAsset(asset, current, binary));
  } catch (caught) { error = caught; }
  return { error, writes, violations, downloadsSinceLastWrite, lookupExact404 };
}

// A state from which a fault-free invocation of this attempt must complete.
function resumable(world: World, attempt: Attempt): boolean {
  const claimed = world.releases.filter(release => release.tag === tag);
  const published = claimed.find(release => !release.draft);
  const intact = (release: StoredRelease): boolean => release.author.id === BOT.id && release.author.type === BOT.type
    && release.body === attempt.body && release.target === sourceSha
    && release.assets.every(asset => asset.state === "uploaded" && !asset.corrupt && asset.bytes.equals(attempt.files.get(asset.name)!));
  if (world.releases.some(release => !release.draft && newer(release.tag, tag))) return false;
  if (published !== undefined) return intact(published) && world.latestId === published.id;
  return claimed.length === 0 || (claimed.length === 1 && intact(claimed[0]!));
}

type Real = { world: World; attempts: ReadonlyMap<AttemptKey, Attempt> };
type Model = Record<string, never>;

class Publish implements fc.AsyncCommand<Model, Real> {
  constructor(readonly key: AttemptKey, readonly fault: Fault) {}
  check(): boolean { return true; }
  async run(_model: Model, real: Real): Promise<void> {
    const attempt = real.attempts.get(this.key)!; const world = real.world;
    const before = new Map(world.releases.map(release => [release.id, snapshot(release)]));
    const beforeReleases = world.releases.map(release => ({ id: release.id, draft: release.draft,
      mine: release.draft && release.tag === tag && release.body === attempt.body && release.author.id === BOT.id && release.target === sourceSha,
      names: release.assets.map(asset => asset.name) }));
    const live = this.fault.kind === "none" && resumable(world, attempt);
    const publishedBefore = world.releases.some(release => release.tag === tag && !release.draft);
    const outcome = await invoke(world, attempt, this.fault);
    expect(outcome.violations).toEqual([]);
    // Nothing is ever deleted, and a published release, a foreign release, or a
    // draft of another attempt is never rewritten.
    for (const prior of beforeReleases) {
      const current = world.releases.find(release => release.id === prior.id);
      expect(current).toBeDefined();
      if (!prior.mine) {
        expect(snapshot(current!)).toBe(before.get(prior.id)!);
      } else {
        // This attempt's own draft only gains missing names; existing assets are untouched.
        for (const name of prior.names) expect(current!.assets.filter(asset => asset.name === name)).toHaveLength(1);
      }
    }
    const creates = outcome.writes.filter(write => write.kind === "create");
    const publishes = outcome.writes.filter(write => write.kind === "publish");
    expect(creates.length).toBeLessThanOrEqual(1);
    expect(publishes.length).toBeLessThanOrEqual(1);
    // Any lookup other than an exact 200 or exact 404 aborts; so does an
    // unreadable inventory whenever the by-tag lookup found nothing.
    if (this.fault.kind.startsWith("lookup-") || (this.fault.kind === "inventory-error" && !publishedBefore)) {
      expect(outcome.error).toBeDefined();
      expect(outcome.writes).toEqual([]);
    }
    if (outcome.error === undefined) {
      const published = world.releases.filter(release => release.tag === tag && !release.draft);
      expect(published).toHaveLength(1);
      const target = published[0]!;
      expect(target.body).toBe(attempt.body);
      expect(target.author).toEqual(BOT);
      expect(world.latestId).toBe(target.id);
      // Success never hides a stable Release that completed above the target.
      expect(world.releases.filter(release => !release.draft && newer(release.tag, tag)).map(release => release.tag)).toEqual([]);
      expect(target.assets.map(asset => asset.name).sort()).toEqual([...names].sort());
      for (const asset of target.assets) {
        expect(asset.corrupt).toBe(false);
        expect(asset.bytes.equals(attempt.files.get(asset.name)!)).toBe(true);
        expect(outcome.downloadsSinceLastWrite.has(asset.id)).toBe(true);
      }
    } else if (live) {
      throw new Error(`fault-free ${this.key} invocation from a resumable state failed: ${String(outcome.error)}`);
    }
  }
  toString(): string { return `Publish(${this.key}, ${JSON.stringify(this.fault)})`; }
}

type HigherKind = "draft" | "published-latest" | "published-not-latest";
// A later stable version: a draft, or a completed Release that GitHub may or may
// not project as Latest (make_latest=false leaves the predecessor as Latest).
function publishHigher(world: World, kind: HigherKind): void {
  if (world.releases.some(release => release.tag === higherTag)) return;
  const draft = kind === "draft";
  world.clock += 1;
  world.releases.push({ id: world.nextId, tag: higherTag, draft, immutable: !draft,
    body: "later release", target: "d".repeat(40), name: `Ghostget ${higherTag}`, author: { ...BOT },
    assets: releaseAssetNames(higherTag).map(name => ({ id: world.nextAssetId++, name, bytes: Buffer.from(`later:${name}`), state: "uploaded", corrupt: false })),
    publishedAt: draft ? null : timestamp(world.clock), untagged: "1".repeat(20) });
  if (kind === "published-latest") world.latestId = world.nextId;
  world.nextId += 1;
}

class HigherRelease implements fc.AsyncCommand<Model, Real> {
  constructor(readonly kind: HigherKind) {}
  check(): boolean { return true; }
  async run(_model: Model, real: Real): Promise<void> { publishHigher(real.world, this.kind); }
  toString(): string { return `HigherRelease(${this.kind})`; }
}

type FrontRunKind = "draft" | "copied-receipt-draft" | "published";
// The owner creates a Release for the tag by hand: an ordinary draft, a draft
// that copies this run's exact receipt body, or a completed Release.
class FrontRun implements fc.AsyncCommand<Model, Real> {
  constructor(readonly kind: FrontRunKind) {}
  check(): boolean { return true; }
  async run(_model: Model, real: Real): Promise<void> {
    const world = real.world; const published = this.kind === "published";
    if (published && world.releases.some(release => release.tag === tag && !release.draft)) return;
    world.clock += 1;
    const release: StoredRelease = { id: world.nextId++, tag, draft: !published, immutable: published,
      body: this.kind === "copied-receipt-draft" ? real.attempts.get("R1")!.body : "owner release", target: sourceSha,
      name: `Ghostget ${tag}`, author: { ...OWNER },
      assets: published ? names.map(name => ({ id: world.nextAssetId++, name, bytes: Buffer.from(`owner:${name}`), state: "uploaded", corrupt: false })) : [],
      publishedAt: published ? timestamp(world.clock) : null, untagged: "2".repeat(20) };
    world.releases.push(release);
    if (published && !world.releases.some(item => !item.draft && newer(item.tag, tag))) world.latestId = release.id;
  }
  toString(): string { return `FrontRun(${this.kind})`; }
}

// Immutable Releases lock tag and assets, but the body stays editable.
class EditPublishedBody implements fc.AsyncCommand<Model, Real> {
  check(): boolean { return true; }
  async run(_model: Model, real: Real): Promise<void> {
    const published = real.world.releases.find(release => release.tag === tag && !release.draft);
    if (published !== undefined && !published.body.endsWith("\n\nedited")) published.body = `${published.body}\n\nedited`;
  }
  toString(): string { return "EditPublishedBody"; }
}

class CorruptStoredAsset implements fc.AsyncCommand<Model, Real> {
  constructor(readonly pick: number) {}
  check(): boolean { return true; }
  async run(_model: Model, real: Real): Promise<void> {
    const candidates = real.world.releases.filter(release => release.tag === tag).flatMap(release => release.assets);
    if (candidates.length !== 0) candidates[this.pick % candidates.length]!.corrupt = true;
  }
  toString(): string { return `CorruptStoredAsset(${this.pick})`; }
}

const faultArbitrary: fc.Arbitrary<Fault> = fc.oneof(
  { weight: 8, arbitrary: fc.constant<Fault>({ kind: "none" }) },
  { weight: 2, arbitrary: fc.constantFrom<LookupFault>("lookup-500", "lookup-403", "lookup-status-mismatch", "lookup-malformed",
    "lookup-wrong-404-body", "inventory-error").map((kind): Fault => ({ kind })) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constantFrom("crash-before" as const, "lost-after" as const, "starter" as const),
    at: fc.integer({ min: 1, max: 7 }) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constantFrom("authority-drift" as const, "main-advances" as const, "concurrent-higher" as const),
    at: fc.integer({ min: 1, max: 9 }) }) },
);
const commandArbitrary = fc.commands<Model, Real>([
  // Most schedules keep one attempt resuming through faults; the rest interleave rivals.
  faultArbitrary.map(fault => new Publish("R1", fault)),
  faultArbitrary.map(fault => new Publish("R1", fault)),
  faultArbitrary.map(fault => new Publish("R1", fault)),
  fc.tuple(fc.constantFrom<AttemptKey>("R1", "R2", "R3", "F1"), faultArbitrary).map(([key, fault]) => new Publish(key, fault)),
  fc.constantFrom<HigherKind>("draft", "published-latest", "published-not-latest").map(kind => new HigherRelease(kind)),
  fc.constantFrom<FrontRunKind>("draft", "copied-receipt-draft", "published").map(kind => new FrontRun(kind)),
  fc.constant(new EditPublishedBody()),
  fc.nat({ max: 20 }).map(pick => new CorruptStoredAsset(pick)),
], { maxCommands: 12 });

let root = "";
const attempts = new Map<AttemptKey, Attempt>();

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ghostget-publisher-model-"));
  for (const key of attemptKeys) {
    const { runId, runAttempt } = attemptCoordinates[key];
    const directory = join(root, key); await mkdir(directory);
    const files = new Map<string, Buffer>();
    for (const name of names) {
      const bytes = Buffer.from(`fixture:${name}:run=${runId}:attempt=${runAttempt}`);
      files.set(name, bytes); await writeFile(join(directory, name), bytes);
    }
    const archive = files.get(names[0]!)!;
    const manifest = parseReleaseManifest({ schema: "hraness-github-release-v1", repository, repositoryId: 1316443113,
      package: "@hraness/ghostget", version: tag.slice(1), tag, sourceSha, workflowSha, workflow: ".github/workflows/release.yml",
      runId, runAttempt, archive: { name: names[0], bytes: archive.length, sha256: sha256(archive),
        sha512: createHash("sha512").update(archive).digest("hex") } });
    attempts.set(key, { key, directory, manifest, body: bodyFor(runId, runAttempt), files });
  }
});
afterAll(async () => { if (root !== "") await rm(root, { recursive: true, force: true }); });

// About three seconds locally; the interrupt keeps a loaded runner inside the per-test timeout.
const PUBLISHER_MODEL_PROPERTY = Object.freeze({ numRuns: 1000, interruptAfterTimeLimit: 30_000 });

describe("canonical GitHub publisher stateful model", () => {
  test("stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws", async () => {
    await assertAsyncProperty(fc.asyncProperty(commandArbitrary, async (commands) => {
      await fc.asyncModelRun(() => ({ model: {}, real: { world: initialWorld(), attempts } }), commands);
    }), PUBLISHER_MODEL_PROPERTY);
  });

  test("a lost publication response is resumed by the same attempt and refused by a later attempt", async () => {
    const world = initialWorld();
    const lost = await invoke(world, attempts.get("R1")!, { kind: "lost-after", at: 7 });
    expect(lost.error).toBeDefined(); expect(lost.violations).toEqual([]);
    expect(lost.writes.map(write => write.kind)).toEqual(["create", "upload", "upload", "upload", "upload", "upload", "publish"]);
    const later = await invoke(world, attempts.get("R2")!, { kind: "none" });
    expect(later.error).toBeDefined(); expect(later.writes).toEqual([]);
    const resumed = await invoke(world, attempts.get("R1")!, { kind: "none" });
    expect(resumed.error).toBeUndefined(); expect(resumed.writes).toEqual([]); expect(resumed.violations).toEqual([]);
  });

  test("regression: a stable Release that completes out of band during the final publication authority fails the run closed", async () => {
    // Shrunk counterexample Publish(R1, concurrent-higher at main read 7): the
    // completed-Release census passed, v0.17.1 completed without taking Latest
    // while the prewrite authority ran, and the PATCH then made v0.17.0 Latest.
    const world = initialWorld();
    const raced = await invoke(world, attempts.get("R1")!, { kind: "concurrent-higher", at: 7 });
    expect(raced.violations).toEqual([]);
    expect(raced.writes.map(write => write.kind)).toEqual(["create", "upload", "upload", "upload", "upload", "upload", "publish"]);
    expect(String(raced.error)).toContain("is not newer than v0.17.1");
    const rerun = await invoke(world, attempts.get("R1")!, { kind: "none" });
    expect(rerun.error).toBeDefined(); expect(rerun.writes).toEqual([]);
  });

  test("an interrupted upload left in the starter state is preserved and never replaced", async () => {
    const world = initialWorld();
    const interrupted = await invoke(world, attempts.get("R1")!, { kind: "starter", at: 3 });
    expect(interrupted.error).toBeDefined();
    const assetCount = world.releases.find(release => release.tag === tag)!.assets.length;
    for (const key of ["R1", "R2"] as const) {
      const retry = await invoke(world, attempts.get(key)!, { kind: "none" });
      expect(retry.error).toBeDefined(); expect(retry.writes).toEqual([]); expect(retry.violations).toEqual([]);
    }
    expect(world.releases.find(release => release.tag === tag)!.assets).toHaveLength(assetCount);
  });
});
