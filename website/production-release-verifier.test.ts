import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  collectBoundedChildOutput,
  fetchGithubCommitSha,
  fetchCanonicalAsset,
  fetchPublicJson,
  loadProductionReleaseEvidence,
  parseGithubCommitSha,
  parseProductionReleaseIdentity,
  readBoundedJsonResponse,
  readBoundedStream,
  readGithubCommitShaResponse,
  verifyProductionRelease,
  verifyProductionReleaseEvidence,
  type BoundedChildProcess,
  type ProductionReleaseEvidence,
} from "./production-release-verifier";
import { parseReleaseAssetDescriptors, releaseAssetNames } from "./github-release-artifact.mjs";

test("canonical production admission binds immutable archive bytes without npm availability", async () => {
  const tag = "v0.16.13";
  const archive = Buffer.from("exact tested archive fixture");
  const sourceSha = "a".repeat(40);
  const manifest = Buffer.from(JSON.stringify({ schema: "hraness-github-release-v1", repository: "hraness/wrench", repositoryId: 1316443113,
    package: "@hraness/wrench", version: "0.16.13", tag, sourceSha, workflowSha: "b".repeat(40), workflow: ".github/workflows/release.yml", runId: 123, runAttempt: 1,
    archive: { name: "hraness-wrench-0.16.13.tgz", bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex"), sha512: createHash("sha512").update(archive).digest("hex") },
  }));
  const assets = releaseAssetNames(tag).map((name, index) => {
    const bytes = name.endsWith(".tgz") ? archive : name === "release-manifest.json" ? manifest : Buffer.from("admitted metadata");
    return { id: index + 1, name, size: bytes.length, state: "uploaded", digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      url: `https://api.github.com/repos/hraness/wrench/releases/assets/${index + 1}`,
      browser_download_url: `https://github.com/hraness/wrench/releases/download/${tag}/${name}` };
  });
  const release = { id: 1, tag_name: tag, draft: false, prerelease: false, immutable: true, target_commitish: sourceSha,
    author: { id: 41898282, type: "Bot" }, body: `wrench-release-source-v1 repository=hraness/wrench tag=${tag} source_sha=${sourceSha} workflow_run_id=123`, assets };
  const evidence = { headSha: sourceSha, githubTagCommitSha: sourceSha, githubRelease: release, latestGithubRelease: release,
    canonicalAssets: { archive, manifest } };
  const identity = { name: "@hraness/wrench", version: "0.16.13" };
  expect(verifyProductionReleaseEvidence(identity, evidence).sourceSha).toBe(sourceSha);
  for (const changed of [
    { ...evidence, canonicalAssets: { archive: Buffer.from("corrupt"), manifest } },
    { ...evidence, canonicalAssets: { archive, manifest: Buffer.from("{}") } },
    { ...evidence, githubRelease: { ...release, target_commitish: "b".repeat(40) } },
    { ...evidence, githubRelease: { ...release, author: { id: 894119, type: "User" } } },
    { ...evidence, githubRelease: { ...release, body: release.body.replace("run_id=123", "run_id=124") } },
    { ...evidence, latestGithubRelease: { ...release, assets: assets.slice(1) } },
    { ...evidence, npmManifest: { name: identity.name, version: identity.version } },
  ]) expect(() => verifyProductionReleaseEvidence(identity, changed)).toThrow();
  const urls: string[] = [];
  const loaded = await loadProductionReleaseEvidence(parseProductionReleaseIdentity(identity), {
    readHeadSha: async () => sourceSha, fetchGithubCommitSha: async () => sourceSha,
    fetchJson: async url => { urls.push(url); return release; },
    fetchAsset: async asset => asset.name.endsWith(".tgz") ? archive : manifest,
  });
  expect(verifyProductionReleaseEvidence(identity, loaded).tag).toBe(tag);
  expect(urls).toHaveLength(2); expect(urls.every(url => url.startsWith("https://api.github.com/"))).toBe(true);
  const descriptor = parseReleaseAssetDescriptors(assets, tag).find(asset => asset.name.endsWith(".tgz"))!;
  const response = (bytes: Uint8Array, url: string): Response => {
    const value = new Response(Uint8Array.from(bytes).buffer); Object.defineProperty(value, "url", { value: url }); return value;
  };
  expect(await fetchCanonicalAsset(descriptor, async () => response(archive, "https://release-assets.githubusercontent.com/exact"))).toEqual(new Uint8Array(archive));
  await expect(fetchCanonicalAsset(descriptor, async () => response(archive, "https://example.com/asset"))).rejects.toThrow();
  await expect(fetchCanonicalAsset(descriptor, async () => response(Buffer.concat([archive, archive]), descriptor.url))).rejects.toThrow();
});

const packageValue = Object.freeze({
  name: "@hraness/wrench",
  version: "0.16.2",
});
const peeledCommitSha = "1234567890abcdef1234567890abcdef12345678";
const headSha = peeledCommitSha;
const tagObjectSha = "abcdef1234567890abcdef1234567890abcdef12";
const tagCommitUrl =
  "https://api.github.com/repos/hraness/wrench/commits/refs%2Ftags%2Fv0.16.2";
const ambiguousTagCommitUrls = Object.freeze([
  "https://api.github.com/repos/hraness/wrench/commits/v0.16.2",
  "https://api.github.com/repos/hraness/wrench/commits/tags/v0.16.2",
  "https://api.github.com/repos/hraness/wrench/commits/refs/tags/v0.16.2",
]);
const packageIntegrity = `sha512-${"A".repeat(86)}==`;

function streamFrom(
  chunks: readonly Uint8Array[],
  onCancel: () => void = () => {},
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    cancel: onCancel,
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(chunk);
    },
  });
}

function validEvidence(): ProductionReleaseEvidence {
  const githubRelease = {
    draft: false,
    id: 162,
    immutable: true,
    prerelease: false,
    tag_name: "v0.16.2",
  };
  return {
    githubRelease,
    githubTagCommitSha: headSha,
    headSha,
    latestGithubRelease: { ...githubRelease },
    npmManifest: {
      dist: { integrity: packageIntegrity },
      name: "@hraness/wrench",
      version: "0.16.2",
    },
  };
}

describe("production website release verification", () => {
  test("parses the package version into one exact release tag", () => {
    expect(parseProductionReleaseIdentity(packageValue)).toEqual({
      name: "@hraness/wrench",
      tag: "v0.16.2",
      version: "0.16.2",
    });
    expect(() => parseProductionReleaseIdentity({ ...packageValue, version: "0.16.2-rc.1" }))
      .toThrow("stable semantic version");
    expect(() => parseProductionReleaseIdentity({ ...packageValue, name: "wrench" }))
      .toThrow("must name @hraness/wrench");
  });

  test("streams bytes up to the exact bound and cancels before oversize accumulation", async () => {
    const encoder = new TextEncoder();
    expect(new TextDecoder().decode(
      await readBoundedStream(
        streamFrom([encoder.encode("abc"), encoder.encode("def")]),
        6,
        "fixture",
      ),
    )).toBe("abcdef");

    let cancelled = false;
    await expect(readBoundedStream(
      streamFrom(
        [encoder.encode("1234"), encoder.encode("5678")],
        () => { cancelled = true; },
      ),
      7,
      "oversize fixture",
    )).rejects.toThrow("exceeded 7 bytes");
    expect(cancelled).toBe(true);
  });

  test("streams and bounds JSON responses instead of buffering them implicitly", async () => {
    const encoder = new TextEncoder();
    const parsed = await readBoundedJsonResponse(
      new Response(streamFrom([encoder.encode('{"ok":'), encoder.encode("true}")])),
      11,
      "JSON fixture",
    );
    expect(parsed).toEqual({ ok: true });

    let cancelled = false;
    await expect(readBoundedJsonResponse(
      new Response(streamFrom(
        [encoder.encode('{"large":"'), encoder.encode("xxxxxxxxxxxxxxxx\"}")],
        () => { cancelled = true; },
      )),
      16,
      "oversize JSON fixture",
    )).rejects.toThrow("exceeded 16 bytes");
    expect(cancelled).toBe(true);

    let contentLengthCancelled = false;
    await expect(readBoundedJsonResponse(
      new Response(
        streamFrom([encoder.encode('{"ok":true}')], () => {
          contentLengthCancelled = true;
        }),
        { headers: { "Content-Length": "17" } },
      ),
      16,
      "declared oversize fixture",
    )).rejects.toThrow("exceeded 16 bytes");
    expect(contentLengthCancelled).toBe(true);
  });

  test("aborts a public JSON read at its fixed deadline", async () => {
    await expect(fetchPublicJson(
      "https://api.github.com/example",
      "timeout fixture",
      async (_url, init) => {
        const signal = init.signal;
        if (!(signal instanceof AbortSignal)) {
          throw new Error("timeout fixture has no AbortSignal");
        }
        return new Promise<Response>((_resolve, reject) => {
          const rejectFromAbort = () => { reject(signal.reason); };
          if (signal.aborted) rejectFromAbort();
          else signal.addEventListener("abort", rejectFromAbort, { once: true });
        });
      },
      1,
    )).rejects.toHaveProperty("name", "TimeoutError");
  });

  test("requests one separately bounded GitHub commit SHA", async () => {
    let requestedUrl: string | undefined;
    let requestedInit: RequestInit | undefined;
    await expect(fetchGithubCommitSha(
      tagCommitUrl,
      "GitHub SHA fixture",
      async (url, init) => {
        requestedUrl = url;
        requestedInit = init;
        return new Response(headSha, {
          headers: { "Content-Length": "40" },
        });
      },
      100,
    )).resolves.toBe(headSha);
    expect(requestedUrl).toBe(tagCommitUrl);
    expect(new Headers(requestedInit?.headers).get("accept"))
      .toBe("application/vnd.github.sha");
    expect(requestedInit?.redirect).toBe("error");
    expect(requestedInit?.signal).toBeInstanceOf(AbortSignal);

    await expect(fetchGithubCommitSha(
      "https://api.github.com/example",
      "timeout SHA fixture",
      async (_url, init) => {
        const signal = init.signal;
        if (!(signal instanceof AbortSignal)) {
          throw new Error("timeout SHA fixture has no AbortSignal");
        }
        return new Promise<Response>((_resolve, reject) => {
          const rejectFromAbort = () => { reject(signal.reason); };
          if (signal.aborted) rejectFromAbort();
          else signal.addEventListener("abort", rejectFromAbort, { once: true });
        });
      },
      1,
    )).rejects.toHaveProperty("name", "TimeoutError");
  });

  test("accepts exactly 40 SHA bytes and rejects malformed response boundaries", async () => {
    await expect(readGithubCommitShaResponse(
      new Response(streamFrom([new TextEncoder().encode(headSha)])),
      "SHA fixture",
    )).resolves.toBe(headSha);

    for (const value of [
      headSha.toUpperCase(),
      headSha.slice(1),
      `${headSha}\n`,
      `${headSha.slice(0, -1)}g`,
      `${headSha.slice(0, -1)}é`,
    ]) {
      await expect(readGithubCommitShaResponse(
        new Response(streamFrom([new TextEncoder().encode(value)])),
        "hostile SHA fixture",
      )).rejects.toThrow();
    }

    let oversizedCancelled = false;
    await expect(readGithubCommitShaResponse(
      new Response(streamFrom(
        [new TextEncoder().encode(headSha), new TextEncoder().encode("0")],
        () => { oversizedCancelled = true; },
      )),
      "oversize SHA fixture",
    )).rejects.toThrow("exceeded 40 bytes");
    expect(oversizedCancelled).toBe(true);

    let declaredLengthCancelled = false;
    await expect(readGithubCommitShaResponse(
      new Response(
        streamFrom([new TextEncoder().encode(headSha)], () => {
          declaredLengthCancelled = true;
        }),
        { headers: { "Content-Length": "41" } },
      ),
      "declared SHA fixture",
    )).rejects.toThrow("must be exactly 40 bytes");
    expect(declaredLengthCancelled).toBe(true);

    let statusCancelled = false;
    await expect(readGithubCommitShaResponse(
      new Response(
        streamFrom([new TextEncoder().encode("not found")], () => {
          statusCancelled = true;
        }),
        { status: 404 },
      ),
      "missing SHA fixture",
    )).rejects.toThrow("returned HTTP 404");
    expect(statusCancelled).toBe(true);
  });

  test("kills a child when streamed command output crosses its bound", async () => {
    const encoder = new TextEncoder();
    let killed = false;
    const child: BoundedChildProcess = {
      exited: Promise.resolve(0),
      kill: () => { killed = true; },
      stderr: streamFrom([]),
      stdout: streamFrom([encoder.encode("1234"), encoder.encode("5678")]),
    };
    await expect(collectBoundedChildOutput(child, "git fixture", 7, 7))
      .rejects.toThrow("stdout exceeded 7 bytes");
    expect(killed).toBe(true);

    killed = false;
    await expect(collectBoundedChildOutput({
      exited: Promise.resolve(0),
      kill: () => { killed = true; },
      stderr: streamFrom([encoder.encode("1234"), encoder.encode("5678")]),
      stdout: streamFrom([]),
    }, "git stderr fixture", 7, 7)).rejects.toThrow("stderr exceeded 7 bytes");
    expect(killed).toBe(true);

    await expect(collectBoundedChildOutput({
      exited: Promise.resolve(128),
      kill: () => {},
      stderr: streamFrom([encoder.encode("not a git repository")]),
      stdout: streamFrom([]),
    }, "production HEAD fixture", 64, 64)).rejects.toThrow("exit code 128");
  });

  test("accepts exact HEAD, npm, immutable release, and Latest evidence", async () => {
    expect(verifyProductionReleaseEvidence(packageValue, validEvidence())).toEqual({
      name: "@hraness/wrench",
      sourceSha: headSha,
      tag: "v0.16.2",
      version: "0.16.2",
    });
    expect(parseGithubCommitSha(headSha)).toBe(headSha);

    let requestedIdentity: unknown;
    await expect(verifyProductionRelease(packageValue, async (identity) => {
      requestedIdentity = identity;
      return validEvidence();
    })).resolves.toEqual({
      ...parseProductionReleaseIdentity(packageValue),
      sourceSha: headSha,
    });
    expect(requestedIdentity).toEqual(parseProductionReleaseIdentity(packageValue));
  });

  test("loads the tag through a separate bounded GitHub SHA request and never invokes remote Git", async () => {
    const identity = parseProductionReleaseIdentity(packageValue);
    const requested: string[] = [];
    const expected = validEvidence();
    expect(tagObjectSha).not.toBe(peeledCommitSha);
    const annotatedTagResponses = new Map<string, string>([
      [tagCommitUrl, peeledCommitSha],
      ...ambiguousTagCommitUrls.map((url) => [url, tagObjectSha] as const),
    ]);
    await expect(loadProductionReleaseEvidence(identity, {
      fetchGithubCommitSha: async (url) => {
        requested.push(url);
        const sha = annotatedTagResponses.get(url);
        if (sha === undefined) throw new Error(`Unexpected tag commit URL ${url}`);
        return sha;
      },
      fetchJson: async (url) => {
        requested.push(url);
        if (url.includes("registry.npmjs.org")) return expected.npmManifest;
        if (url.endsWith("/releases/latest")) return expected.latestGithubRelease;
        return expected.githubRelease;
      },
      readHeadSha: async () => headSha,
    })).resolves.toEqual(expected);
    expect(requested).toEqual([
      tagCommitUrl,
      "https://registry.npmjs.org/%40hraness%2Fwrench/0.16.2",
      "https://api.github.com/repos/hraness/wrench/releases/tags/v0.16.2",
      "https://api.github.com/repos/hraness/wrench/releases/latest",
    ]);
    for (const ambiguousUrl of ambiguousTagCommitUrls) {
      expect(requested).not.toContain(ambiguousUrl);
    }
    const source = await Bun.file(new URL("./production-release-verifier.ts", import.meta.url)).text();
    expect(source).toContain("encodeURIComponent(`refs/tags/${identity.tag}`)");
    expect(source).not.toContain("/commits/tags/");
    expect(source).not.toContain("ls-remote");
  });

  test("retains Git metadata for mandatory exact production HEAD evidence", async () => {
    const source = await Bun.file(new URL("./production-release-verifier.ts", import.meta.url)).text();
    const vercelIgnore = await Bun.file(new URL("../.vercelignore", import.meta.url)).text();
    const vercelIgnoreRules = vercelIgnore
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(source).toContain('["git", "rev-parse", "--verify", "HEAD^{commit}"]');
    expect(vercelIgnoreRules).toEqual([
      ".env*",
      ".vercel",
      "dist",
      "node_modules",
      "website/dist",
    ]);
  });

  test("rejects hostile GitHub tag commit SHA evidence", () => {
    for (const value of [
      null,
      {},
      headSha.toUpperCase(),
      headSha.slice(1),
      `${headSha}\n`,
    ]) {
      expect(() => parseGithubCommitSha(value)).toThrow();
    }
  });

  test("rejects missing evidence and every release-coordinate mismatch", () => {
    const evidence = validEvidence();
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      latestGithubRelease: undefined,
    })).toThrow("Latest GitHub Release must be an object");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })).toThrow("is not exact GitHub tag v0.16.2 commit");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      headSha: "",
    })).toThrow("lowercase 40-character commit SHA");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      githubTagCommitSha: {},
    })).toThrow("must be exactly one lowercase 40-character commit SHA");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      githubTagCommitSha: tagObjectSha,
    })).toThrow("is not exact GitHub tag v0.16.2 commit");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      npmManifest: { ...(evidence.npmManifest as object), version: "0.16.1" },
    })).toThrow("does not contain exact @hraness/wrench@0.16.2");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      npmManifest: {
        ...(evidence.npmManifest as object),
        dist: { integrity: "sha256-YWJjZA==" },
      },
    })).toThrow("SHA-512 package integrity");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      githubRelease: { ...(evidence.githubRelease as object), immutable: false },
    })).toThrow("must be immutable");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      githubRelease: { ...(evidence.githubRelease as object), draft: true },
    })).toThrow("must not be a draft");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      latestGithubRelease: { ...(evidence.latestGithubRelease as object), id: 161 },
    })).toThrow("is not Latest");
    expect(() => verifyProductionReleaseEvidence(packageValue, {
      ...evidence,
      latestGithubRelease: {
        ...(evidence.latestGithubRelease as object),
        tag_name: "v0.16.1",
      },
    })).toThrow("is not Latest");
    const { latestGithubRelease: _missing, ...missingEvidence } = evidence;
    expect(() => verifyProductionReleaseEvidence(packageValue, missingEvidence))
      .toThrow("must contain exactly");
    expect(() => verifyProductionReleaseEvidence(
      { ...packageValue, version: "0.16.3" },
      evidence,
    )).toThrow("does not contain exact @hraness/wrench@0.16.3");
  });
});
