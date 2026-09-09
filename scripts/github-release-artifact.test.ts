import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReleaseManifest, releaseAssetNames } from "../website/github-release-artifact.mjs";
import { attestationVerifyArguments, verifyBuildHandoff, verifyReleaseDirectory } from "./github-release-artifact.js";
import { publishCanonicalRelease, validateReleaseAssets } from "./github-release-publish.js";

const tag = "v0.16.13";
const sourceSha = "a".repeat(40);
const workflowSha = "b".repeat(40);
const manifest = parseReleaseManifest({ schema: "hraness-github-release-v1", repository: "hraness/wrench", repositoryId: 1316443113,
  package: "@hraness/wrench", version: "0.16.13", tag, sourceSha, workflowSha, workflow: ".github/workflows/release.yml",
  runId: 9001, runAttempt: 1, archive: { name: "hraness-wrench-0.16.13.tgz", bytes: 4, sha256: "c".repeat(64), sha512: "d".repeat(128) } });
const body = `wrench-release-source-v1 repository=hraness/wrench tag=${tag} source_sha=${sourceSha} workflow_run_id=9001\n\nwrench-release-attempt-v1 run_attempt=1`;
const names = releaseAssetNames(tag);
type Json = Record<string, any>;

describe("canonical release publication and safe local input", () => {
  test("pins all documented cryptographic verifier coordinates", () => {
    const args = attestationVerifyArguments("/exact", manifest, "SHA256SUMS");
    expect(args).toEqual(["attestation", "verify", "/exact/SHA256SUMS", "--repo", "hraness/wrench",
      "--signer-workflow", "hraness/wrench/.github/workflows/release.yml", "--signer-digest", sourceSha,
      "--source-digest", sourceSha, "--source-ref", `refs/tags/${tag}`, "--deny-self-hosted-runners",
      "--bundle", "/exact/provenance.jsonl", "--format=json"]);
    expect(() => attestationVerifyArguments("/exact", manifest, "../different")).toThrow();
  });
  test("rejects a symlinked release directory before reading an artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrench-canonical-directory-"));
    try {
      await symlink(root, join(root, "link"));
      await expect(verifyReleaseDirectory(join(root, "link"), {})).rejects.toThrow("ordinary directory");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("publishes only the exact draft inventory and preserves mismatched or ambiguous drafts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wrench-canonical-publisher-"));
    try {
      for (const name of names) await writeFile(join(directory, name), `fixture:${name}`);
      const assets = await Promise.all(names.map(async (name, index) => {
        const bytes = await readFile(join(directory, name));
        return { id: index + 10, name, size: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          state: "uploaded", browser_download_url: `https://github.com/hraness/wrench/releases/download/${tag}/${name}`,
          url: `https://api.github.com/repos/hraness/wrench/releases/assets/${index + 10}` };
      }));
      const temporaryAssets = assets.map(asset => ({ ...asset,
        browser_download_url: `https://github.com/hraness/wrench/releases/download/untagged-ef6c1bd779e9dd4032bb/${asset.name}` }));
      const hashes = Object.fromEntries(assets.slice(0, 4).map(asset => [asset.name, asset.digest.slice(7)]));
      const bundleHash = assets[4]!.digest.slice(7);
      await verifyBuildHandoff(directory, tag, hashes, bundleHash);
      await expect(verifyBuildHandoff(directory, tag, { ...hashes, extra: "a".repeat(64) }, bundleHash)).rejects.toThrow();
      await expect(verifyBuildHandoff(directory, tag, { ...hashes, [names[0]!]: "a".repeat(64) }, bundleHash)).rejects.toThrow();
      await expect(verifyBuildHandoff(directory, tag, hashes, "b".repeat(64))).rejects.toThrow();
      const predecessor = { id: 99, tag_name: "v0.16.11", draft: false, prerelease: false, immutable: true,
        assets: [], published_at: "2026-09-08T01:00:00Z" };
      const draft = (): Json => ({ id: 100, name: `Wrench ${tag}`, tag_name: tag, target_commitish: sourceSha, body,
        draft: true, prerelease: false, immutable: false, author: { id: 41898282, type: "Bot" }, assets: [] });
      const execute = async (initial?: Json, fault = ""): Promise<{ writes: string[]; downloads: number[]; release: Json | undefined; error?: unknown }> => {
        let release = initial === undefined ? undefined : structuredClone(initial); const writes: string[] = [];
        const downloads: number[] = [];
        const run = (args: readonly string[], input?: string): { status: number; stdout: string } => {
          if (args[0] === "node") {
            if (fault === "control-drift") throw new Error("release-control drift");
            return { status: 0, stdout: `sha=${sourceSha}\ntag=${tag}\nmain_sha=${workflowSha}\n` };
          }
          if (args[1] === "release" && args[2] === "upload") {
            const name = args[4]!.split("/").at(-1)!;
            if (release === undefined || release.draft !== true || release.assets.some((asset: Json) => asset.name === name)) throw new Error("unexpected overwrite");
            writes.push(`upload:${name}`); release.assets.push(structuredClone(temporaryAssets.find(asset => asset.name === name)!));
            return { status: 0, stdout: "" };
          }
          if (args[1] !== "api") throw new Error(`Unexpected command ${args.join(" ")}`);
          if (args[2] === "--include") {
            const visible = release?.draft === false;
            return { status: visible ? 0 : 1,
              stdout: `HTTP/2 ${visible ? 200 : 404}\n\n${JSON.stringify(visible ? release : { message: "Not Found" })}` };
          }
          const method = args[3]; const endpoint = args[4]!;
          if (method === "POST") { writes.push("create"); release = { ...draft(), ...JSON.parse(input!) }; return { status: 0, stdout: JSON.stringify(release) }; }
          if (method === "PATCH") {
            if (release?.assets.length !== 5) throw new Error("premature publication");
            writes.push("publish"); release = { ...release, draft: false, immutable: true, published_at: "2026-09-09T01:00:00Z",
              assets: fault === "published-temporary-url" ? release.assets : structuredClone(assets) };
            return { status: 0, stdout: JSON.stringify(release) };
          }
          if (method !== "GET") throw new Error("Unsupported mutation");
          let value: unknown;
          if (endpoint.includes("releases?per_page=100&page=")) {
            value = endpoint.endsWith("page=1") ? [predecessor, ...(release === undefined ? [] : [release])] : [];
            if (fault === "duplicate-tag" && endpoint.endsWith("page=1")) value = [draft(), { ...draft(), id: 101 }];
            if (fault === "duplicate-id" && endpoint.endsWith("page=1")) value = [draft(), draft()];
            if (fault === "resumed-page" && endpoint.endsWith("page=2")) value = [predecessor];
            if (fault === "nonempty-sentinel" && endpoint.endsWith("page=6")) value = [predecessor];
          }
          else if (endpoint.endsWith("/git/ref/heads/main")) value = { object: { type: "commit", sha: workflowSha } };
          else if (endpoint.endsWith("/releases/latest")) value = release?.draft === false ? release : predecessor;
          else if (endpoint.endsWith("/releases/100") || endpoint.endsWith(`/releases/tags/${tag}`)) {
            value = fault === "id-readback-drift" || (fault === "post-upload-id-drift" && writes.length > 0)
              ? { ...release, id: 101 } : release;
          }
          else throw new Error(`Unexpected API ${endpoint}`);
          return { status: 0, stdout: JSON.stringify(value) };
        };
        const download = (id: number, expectedBytes: number): Uint8Array => {
          const asset = assets.find(asset => asset.id === id);
          if (asset === undefined || expectedBytes !== asset.size || !release?.assets.some((current: Json) => current.id === id)) {
            throw new Error("Download must bind one admitted uploaded asset and byte count");
          }
          downloads.push(id);
          return fault === "remote-corrupt" || (fault === "published-corrupt" && release.draft === false)
            ? Buffer.alloc(expectedBytes) : Buffer.from(`fixture:${asset.name}`);
        };
        try { await publishCanonicalRelease(directory, manifest, run, download); return { writes, downloads, release }; }
        catch (error) { return { writes, downloads, release, error }; }
      };
      const fresh = await execute(); expect(fresh.error).toBeUndefined();
      expect(fresh.writes).toEqual(["create", ...names.map(name => `upload:${name}`), "publish"]);
      expect(fresh.downloads).toHaveLength(10);
      const partial = draft(); partial.assets = [temporaryAssets[0]];
      const resumed = await execute(partial); expect(resumed.error).toBeUndefined();
      expect(resumed.writes).toEqual([...names.slice(1).map(name => `upload:${name}`), "publish"]);
      const completed = await execute(fresh.release); expect(completed.error).toBeUndefined(); expect(completed.writes).toEqual([]);
      expect(completed.downloads).toHaveLength(5);
      for (const altered of [
        { ...draft(), target_commitish: workflowSha }, { ...draft(), body: `${body} different-attempt` },
        { ...draft(), immutable: true }, { ...draft(), author: { id: 894119, type: "User" } },
        { ...draft(), assets: [{ ...assets[0], digest: `sha256:${"0".repeat(64)}` }] },
        { ...draft(), assets: [assets[0], assets[0]] }, { ...draft(), assets: [{ ...assets[0], name: "unexpected" }] },
      ]) {
        const denied = await execute(altered); expect(denied.error).toBeDefined(); expect(denied.writes).toEqual([]);
      }
      const drift = await execute(undefined, "control-drift"); expect(drift.error).toBeDefined(); expect(drift.writes).toEqual([]);
      for (const fault of ["duplicate-tag", "duplicate-id", "resumed-page", "nonempty-sentinel", "id-readback-drift"]) {
        const denied = await execute(draft(), fault); expect(denied.error).toBeDefined(); expect(denied.writes).toEqual([]);
      }
      const readbackDrift = await execute(draft(), "post-upload-id-drift");
      expect(readbackDrift.error).toBeDefined(); expect(readbackDrift.writes).toEqual([`upload:${names[0]}`]);
      const temporaryPublished = await execute({ ...fresh.release, assets: temporaryAssets });
      expect(temporaryPublished.error).toBeDefined(); expect(temporaryPublished.writes).toEqual([]);
      const temporaryReadback = await execute({ ...draft(), assets: temporaryAssets }, "published-temporary-url");
      expect(temporaryReadback.error).toBeDefined(); expect(temporaryReadback.writes).toEqual(["publish"]);
      for (const browser_download_url of [
        `https://github.com/other/wrench/releases/download/untagged-ef6c1bd779e9dd4032bb/${names[0]}`,
        "https://github.com/hraness/wrench/releases/download/untagged-ef6c1bd779e9dd4032bb/wrong-name",
        `https://github.com/hraness/wrench/releases/download/untagged-EF6C1BD779E9DD4032BB/${names[0]}`,
        `https://github.com/hraness/wrench/releases/download/untagged-ef6c1bd779e9dd4032b/${names[0]}`,
        `https://github.com/hraness/wrench/releases/download/untagged-ef6c1bd779e9dd4032bb/${names[0]}?download=1`,
        `https://github.com/hraness/wrench/releases/download/untagged-ef6c1bd779e9dd4032bb/nested/${names[0]}`,
      ]) {
        const denied = await execute({ ...draft(), assets: [{ ...assets[0], browser_download_url }] });
        expect(denied.error).toBeDefined(); expect(denied.writes).toEqual([]); expect(denied.downloads).toEqual([]);
      }
      expect(() => validateReleaseAssets({ assets, draft: "true" }, manifest, directory)).toThrow();
      const completeDraft = { ...draft(), assets };
      const corruptDraft = await execute(completeDraft, "remote-corrupt");
      expect(corruptDraft.error).toBeDefined(); expect(corruptDraft.writes).toEqual([]);
      const corruptReadback = await execute(completeDraft, "published-corrupt");
      expect(corruptReadback.error).toBeDefined(); expect(corruptReadback.writes).toEqual(["publish"]);
      const corruptCompleted = await execute(fresh.release, "remote-corrupt");
      expect(corruptCompleted.error).toBeDefined(); expect(corruptCompleted.writes).toEqual([]);
      expect(() => validateReleaseAssets({ draft: true, assets: [{ ...assets[0], url: "https://example.com/asset" }] }, manifest, directory)).toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
