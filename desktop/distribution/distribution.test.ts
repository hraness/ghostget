import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { admitArtifactId } from "./artifact-id.ts";
import { matchSignedManifest, parseHandoff } from "./handoff.ts";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assetNames, archiveName, buildNames, desktopTag, parseManifest, REPOSITORY, REPOSITORY_ID, sha256, VERIFICATIONS, verifyAttestation, verifyDirectory, version, WORKFLOW, type DesktopManifest } from "./contract.ts";
import { authorize, environmentAuthority, type Authority } from "./authority.ts";
import { BUN_ENTITLEMENTS, CREDENTIAL_ENTITLEMENTS, entitlementsFor, inventory, isMachO, validateSignature } from "./native.ts";
import { publish, releaseBody, type PublicationPorts } from "./publish.ts";
import { HelperCustodyUncertain, verifyHelperLifecycle } from "./verify.ts";
import { releaseAssetNames } from "../../website/github-release-artifact.mjs";

// Provider fixtures are deliberately mutable so each test can alter one observed field.
type Json = Record<string, any>;
const tag = "v0.19.0", source = "a".repeat(40), prefix = `repos/${REPOSITORY}`;
const authority: Authority = { tag, source, workflowId: 123, runId: 456, runAttempt: 1 };
function manifest(): DesktopManifest {
  return parseManifest({ schema: "ghostget.desktop-release/1", repository: REPOSITORY, repositoryId: REPOSITORY_ID,
    canonicalTag: tag, desktopTag: desktopTag(tag), version: version(tag), sourceSha: source, sourceTree: "b".repeat(40), workflow: WORKFLOW,
    workflowSha: source, workflowId: 123, runId: 456, runAttempt: 1, architecture: "arm64", minimumMacOS: "14.5", teamId: "ABC123DEF4", signingIdentitySha1: "c".repeat(40),
    archive: { name: archiveName(tag), bytes: 3, sha256: sha256("zip") }, notarization: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", status: "Accepted", stapled: true },
    runtimeInventorySha256: "d".repeat(64), signingInventorySha256: "e".repeat(64), verification: VERIFICATIONS });
}
function artifacts(): { directory: string; manifest: DesktopManifest; hashes: Record<string, string>; files: Record<string, Buffer> } {
  const directory = mkdtempSync("/tmp/ghostget-distribution-test-"), m = manifest(), encoded = `${JSON.stringify(m)}\n`;
  const files = { [archiveName(tag)]: Buffer.from("zip"), "desktop-manifest.json": Buffer.from(encoded),
    SHA256SUMS: Buffer.from(`${sha256("zip")}  ${archiveName(tag)}\n${sha256(encoded)}  desktop-manifest.json\n`), "provenance.jsonl": Buffer.from("verified externally") };
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(directory, name), bytes);
  return { directory, manifest: m, files, hashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)])) };
}
function authorityFixture(): Json {
  const repo = { id: REPOSITORY_ID, full_name: REPOSITORY, private: false, visibility: "public", default_branch: "main" };
  const run = { id: 456, run_attempt: 1, workflow_id: 123, path: WORKFLOW, event: "workflow_dispatch", head_branch: "main", head_sha: source, status: "in_progress", conclusion: null,
    actor: { id: 894119, type: "User" }, triggering_actor: { id: 894119, type: "User" }, repository: repo, head_repository: repo };
  const release = { id: 99, tag_name: tag, target_commitish: source, draft: false, prerelease: false, immutable: true, published_at: "2026-09-11T12:00:00Z", author: { id: 41898282, type: "Bot" },
    body: `wrench-release-source-v1 repository=${REPOSITORY} tag=${tag} source_sha=${source} workflow_run_id=9001\n\nghostget-release-attempt-v1 run_attempt=1`,
    assets: releaseAssetNames(tag).map((name: string, i: number) => ({ id: i + 1, name, size: 1, digest: `sha256:${"f".repeat(64)}`, state: "uploaded", url: `https://api.github.com/${prefix}/releases/assets/${i + 1}`, browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}` })) };
  return { [prefix]: repo, [`${prefix}/git/ref/heads/main`]: { ref: "refs/heads/main", object: { type: "commit", sha: source } },
    [`${prefix}/git/ref/tags/${tag}`]: { ref: `refs/tags/${tag}`, object: { type: "commit", sha: source } },
    [`${prefix}/git/ref/tags/${desktopTag(tag)}`]: { ref: `refs/tags/${desktopTag(tag)}`, object: { type: "commit", sha: source } },
    [`${prefix}/actions/workflows/123`]: { id: 123, path: WORKFLOW, state: "active" }, [`${prefix}/actions/runs/456`]: run,
    [`${prefix}/actions/runs/456/attempts/1`]: structuredClone(run), [`${prefix}/releases/tags/${tag}`]: release, [`${prefix}/releases/latest`]: structuredClone(release) };
}
function certificateFixture(m: DesktopManifest, hashes: Record<string, string>): Json[] {
  const uri = `https://github.com/${REPOSITORY}/${WORKFLOW}@refs/heads/main`;
  return [{ verificationResult: { signature: { certificate: { issuer: "https://token.actions.githubusercontent.com", buildSignerURI: uri, buildSignerDigest: source,
    runnerEnvironment: "github-hosted", sourceRepositoryURI: `https://github.com/${REPOSITORY}`, sourceRepositoryIdentifier: String(REPOSITORY_ID), sourceRepositoryOwnerIdentifier: "307125679",
    sourceRepositoryOwnerURI: "https://github.com/hraness", sourceRepositoryVisibilityAtSigning: "public", buildConfigURI: uri, buildConfigDigest: source, sourceRepositoryDigest: source,
    sourceRepositoryRef: "refs/heads/main", buildTrigger: "workflow_dispatch", runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/456/attempts/1` } }, verifiedTimestamps: [{}],
    statement: { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1", subject: buildNames(m.canonicalTag).map(name => ({ name, digest: { sha256: hashes[name] } })) } } }];
}

describe("desktop distribution contract", () => {
  test("strict manifest, immutable namespace and bounded artifact roundtrip", () => {
    const a = artifacts();
    try {
      expect(verifyDirectory(a.directory, tag, true).manifest).toEqual(a.manifest);
      expect(desktopTag(tag)).toBe("desktop-v0.19.0-macos-arm64");
      expect(releaseAssetNames(tag)).toHaveLength(5); expect(assetNames(tag)).toHaveLength(4);
      for (const invalid of ["v01.19.0", "v0.19.0-rc.1", "../v0.19.0", "v9007199254740992.0.0", "v0.19.0\n"]) expect(() => version(invalid)).toThrow();
      const mutations: ((m: Json) => void)[] = [m => { m.extra = true; }, m => { m.notarization.status = "In Progress"; }, m => { m.notarization.stapled = false; },
        m => { m.architecture = "universal"; }, m => { m.workflowSha = "f".repeat(40); }, m => { m.archive.name = "../app.zip"; }, m => { m.archive.bytes = 1610612737; },
        m => { m.archive.sha256 = "f".repeat(63); }, m => { m.verification = VERIFICATIONS.slice(0, -1); }, m => { m.runAttempt = 0; }, m => { m.minimumMacOS = "13.0"; }];
      for (const mutate of mutations) { const m = structuredClone(a.manifest); mutate(m); expect(() => parseManifest(m)).toThrow(); }
      writeFileSync(join(a.directory, "extra"), "x"); expect(() => verifyDirectory(a.directory, tag, true)).toThrow();
      rmSync(join(a.directory, "extra")); writeFileSync(join(a.directory, archiveName(tag)), "ZIP"); expect(() => verifyDirectory(a.directory, tag, true)).toThrow();
    } finally { rmSync(a.directory, { recursive: true, force: true }); }
  });
  test("arbitrary extra manifest fields never expand authority", () => {
    fc.assert(fc.property(fc.string().filter(key => !Object.hasOwn(manifest(), key)), fc.jsonValue(), (key, value) => {
      expect(() => parseManifest({ ...manifest(), [key]: value })).toThrow();
    }), { numRuns: 150 });
  });
  test("every signed certificate coordinate and the complete exact subject union are mandatory", () => {
    const a = artifacts();
    try {
      const valid = certificateFixture(a.manifest, a.hashes); expect(() => verifyAttestation(valid, a.manifest, a.hashes)).not.toThrow();
      for (const key of Object.keys(valid[0]!.verificationResult.signature.certificate)) {
        const invalid = structuredClone(valid); invalid[0]!.verificationResult.signature.certificate[key] = "foreign";
        expect(() => verifyAttestation(invalid, a.manifest, a.hashes)).toThrow();
      }
      for (const mutate of [(r: Json) => { r.verifiedTimestamps = []; }, (r: Json) => { r.statement.subject.pop(); }, (r: Json) => { r.statement.subject[1] = r.statement.subject[0]; },
        (r: Json) => { r.statement.subject[0].name = "other.zip"; }, (r: Json) => { r.statement.subject[0].digest.sha256 = "f".repeat(64); }, (r: Json) => { r.statement.subject[0].digest.sha512 = "f".repeat(128); }]) {
        const invalid = structuredClone(valid); mutate(invalid[0]!.verificationResult); expect(() => verifyAttestation(invalid, a.manifest, a.hashes)).toThrow();
      }
    } finally { rmSync(a.directory, { recursive: true, force: true }); }
  });
  test("fresh source, two tags, active exact attempt, canonical5 and Latest fail closed", () => {
    expect(() => authorize(authority, path => authorityFixture()[path])).not.toThrow();
    const mutations: ((responses: Json) => void)[] = [r => { r[prefix].private = true; }, r => { r[`${prefix}/git/ref/heads/main`].object.sha = "b".repeat(40); },
      r => { r[`${prefix}/git/ref/tags/${desktopTag(tag)}`].object.type = "tag"; }, r => { r[`${prefix}/git/ref/tags/${tag}`].object.sha = "b".repeat(40); },
      r => { r[`${prefix}/actions/workflows/123`].path = ".github/workflows/release.yml"; }, r => { r[`${prefix}/actions/runs/456`].run_attempt = 2; },
      r => { r[`${prefix}/actions/runs/456/attempts/1`].triggering_actor.id = 1; }, r => { r[`${prefix}/actions/runs/456`].status = "completed"; },
      r => { r[`${prefix}/releases/tags/${tag}`].immutable = false; }, r => { r[`${prefix}/releases/tags/${tag}`].assets.pop(); }, r => { r[`${prefix}/releases/latest`].id++; },
      r => { r[`${prefix}/releases/latest`].assets[0].digest = `sha256:${"a".repeat(64)}`; }];
    for (const mutate of mutations) { const responses = authorityFixture(); mutate(responses); expect(() => authorize(authority, path => responses[path])).toThrow(); }
    const env = { GITHUB_SHA: source, DESKTOP_CANONICAL_TAG: tag, GITHUB_REPOSITORY: REPOSITORY, GITHUB_REPOSITORY_ID: String(REPOSITORY_ID), GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main", GITHUB_WORKFLOW_REF: `${REPOSITORY}/${WORKFLOW}@refs/heads/main`, GITHUB_WORKFLOW_SHA: source, GITHUB_ACTOR_ID: "894119", RUNNER_ENVIRONMENT: "github-hosted", DESKTOP_RELEASE_WORKFLOW_ID: "123", GITHUB_RUN_ID: "456", GITHUB_RUN_ATTEMPT: "1" };
    expect(environmentAuthority(env)).toEqual(authority);
    for (const key of Object.keys(env)) expect(() => environmentAuthority({ ...env, [key]: "foreign" })).toThrow();
  });
  test("nested native discovery and precise entitlement policy reject unsafe input", () => {
    const directory = mkdtempSync("/tmp/ghostget-native-inventory-");
    try {
      writeFileSync(join(directory, "extensionless"), Buffer.from("cffaedfe00000000", "hex")); writeFileSync(join(directory, "ordinary.txt"), "text");
      expect(inventory(directory).filter(file => file.macho).map(file => file.path)).toEqual(["extensionless"]);
      expect(isMachO(new Uint8Array())).toBe(false); expect(isMachO(Buffer.from("cffaedfe", "hex"))).toBe(true);
      symlinkSync("ordinary.txt", join(directory, "link")); expect(() => inventory(directory)).toThrow();
      expect(entitlementsFor("Contents/Resources/ghostget-runtime/ghostget-bun")).toEqual(BUN_ENTITLEMENTS);
      expect(entitlementsFor("Contents/Resources/ghostget-runtime/ghostget-credential-bun")).toEqual(CREDENTIAL_ENTITLEMENTS);
      expect(entitlementsFor("Contents/MacOS/ghostget-desktop")).toEqual({}); expect(entitlementsFor("anything/ghostget-bun")).toEqual({});
      expect(Object.keys(CREDENTIAL_ENTITLEMENTS)).toEqual(["com.apple.security.cs.allow-jit"]);
      const details = "Identifier=com.ghostget.desktop\nTeamIdentifier=ABC123DEF4\nAuthority=Developer ID Application: Example (ABC123DEF4)\nTimestamp=Sep 11, 2026\nCodeDirectory v=20500 size=100 flags=0x10000(runtime) hashes=1\n";
      expect(() => validateSignature(details, "ABC123DEF4", "com.ghostget.desktop")).not.toThrow();
      for (const line of details.trim().split("\n")) expect(() => validateSignature(details.replace(`${line}\n`, ""), "ABC123DEF4", "com.ghostget.desktop")).toThrow();
      expect(() => validateSignature(`${details}Signature=adhoc\n`, "ABC123DEF4")).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

describe("desktop publication lifecycle", () => {
  function fixture(a: ReturnType<typeof artifacts>, fault = "", initial?: Json) {
    let release: Json | undefined = initial === undefined ? undefined : structuredClone(initial); const effects: string[] = [], bodies: Json[] = []; let authorizations = 0;
    const ports: PublicationPorts = {
      authorize: () => { authorizations++; if (fault === "authority" && authorizations === 3) throw Error("authority moved"); },
      read: path => {
        if (path === `${prefix}/releases?per_page=100&page=1`) return [{ id: 50, tag_name: "v0.18.0", immutable: true }, ...(release ? [structuredClone(release)] : [])];
        if (release && path === `${prefix}/releases/${release.id}`) return structuredClone(release);
        throw Error("unexpected read");
      },
      mutate: (method, path, raw) => {
        const body = raw as Json; bodies.push(body); effects.push(method);
        if (method === "POST" && path === `${prefix}/releases` && !release) release = { ...body, id: 100, immutable: false, author: { id: 41898282, type: "Bot" }, assets: [] };
        else if (method === "PATCH" && release && path === `${prefix}/releases/100`) { release.draft = false; release.immutable = true; }
        else throw Error("unexpected mutation");
        return structuredClone(release);
      },
      upload: (id, name, bytes) => {
        expect(id).toBe(100); expect(release?.draft).toBe(true); expect(release?.assets.some((asset: Json) => asset.name === name)).toBe(false); expect(bytes).toEqual(a.files[name]!); effects.push(`upload:${name}`);
        release!.assets.push({ id: 1000 + release!.assets.length, name, state: "uploaded", size: bytes.length, digest: `sha256:${a.hashes[name]}`,
          browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${desktopTag(tag)}/${name}` });
        if (fault === "uncertain-upload") throw Error("connection lost after possible effect");
        return {};
      },
      download: async id => { const asset = release!.assets.find((asset: Json) => asset.id === id); return fault === "bytes" ? Buffer.from("corrupt") : a.files[asset.name]!; },
    };
    return { ports, effects, bodies, release: () => release };
  }
  test("create/upload/readback/publish exact4, preserve history/Latest, exact-repeat is read-only", async () => {
    const a = artifacts();
    try {
      const f = fixture(a); await publish(a.directory, a.manifest, a.hashes, f.ports);
      expect(f.effects).toEqual(["POST", ...assetNames(tag).map(name => `upload:${name}`), "PATCH"]);
      expect(f.bodies.every(body => body.make_latest === "false" && body.prerelease === true)).toBe(true);
      const again = fixture(a, "", f.release()); await publish(a.directory, a.manifest, a.hashes, again.ports); expect(again.effects).toEqual([]);
      for (const mutate of [(r: Json) => { r.body += "changed"; }, (r: Json) => { r.immutable = false; }, (r: Json) => { r.target_commitish = "f".repeat(40); },
        (r: Json) => { r.assets.push({ ...r.assets[0], id: 2000 }); }, (r: Json) => { r.assets[0].digest = `sha256:${"f".repeat(64)}`; }, (r: Json) => { r.author.id = 894119; }]) {
        const changed = structuredClone(f.release()!); mutate(changed); const rejected = fixture(a, "", changed);
        await expect(publish(a.directory, a.manifest, a.hashes, rejected.ports)).rejects.toThrow(); expect(rejected.effects).toEqual([]);
      }
    } finally { rmSync(a.directory, { recursive: true, force: true }); }
  });
  test("authority drift, corrupt remote bytes, and uncertain uploads never publish or retry", async () => {
    const a = artifacts();
    try {
      for (const fault of ["authority", "bytes", "uncertain-upload"]) {
        const f = fixture(a, fault); await expect(publish(a.directory, a.manifest, a.hashes, f.ports)).rejects.toThrow();
        expect(f.effects).not.toContain("PATCH"); expect(f.effects.filter(effect => effect.startsWith("upload:")).length).toBeLessThanOrEqual(1);
      }
      const previous = { id: 100, tag_name: desktopTag(tag), target_commitish: source, body: releaseBody({ ...a.manifest, runAttempt: 2 }), draft: true, prerelease: true, immutable: false, author: { id: 41898282, type: "Bot" }, assets: [] };
      const f = fixture(a, "", previous); await expect(publish(a.directory, a.manifest, a.hashes, f.ports)).rejects.toThrow(); expect(f.effects).toEqual([]);
    } finally { rmSync(a.directory, { recursive: true, force: true }); }
  });
});

test("workflow isolates dependency builds, Apple secrets, executable verification and OIDC on fresh runners", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../../.github/workflows/desktop-release.yml", import.meta.url), "utf8")) as Json;
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]); expect(Object.keys(workflow.jobs)).toEqual(["authorize", "build", "sign", "verify", "attest", "publish"]);
  const jobs = workflow.jobs, build = jobs.build.steps as Json[], sign = jobs.sign.steps as Json[], verify = jobs.verify.steps as Json[], attest = jobs.attest.steps as Json[], publishSteps = jobs.publish.steps as Json[];
  for (const name of ["build", "sign", "verify"]) { expect(jobs[name]["runs-on"]).toBe("macos-15"); expect(jobs[name].permissions).toEqual({ contents: "read", actions: "read" }); }
  expect(jobs.build.environment).toBeUndefined(); expect(jobs.verify.environment).toBeUndefined(); expect(jobs.sign.environment).toBe("desktop-signing");
  expect(jobs.sign.needs).toBe("build"); expect(jobs.verify.needs).toBe("sign"); expect(jobs.attest.needs).toEqual(["sign", "verify"]);
  expect(jobs.publish.needs).toEqual(["sign", "verify", "attest"]);
  expect(jobs.attest.permissions).toEqual({ contents: "read", actions: "read", "id-token": "write", attestations: "write" });
  expect(jobs.publish.permissions).toEqual({ contents: "write", actions: "read", attestations: "read" });
  const signing = sign.find(step => step.run?.includes("distribution/sign.ts"))!;
  const secretConsumers = Object.values(jobs).flatMap((j: any) => j.steps).filter((step: Json) => JSON.stringify(step).includes("secrets."));
  expect(secretConsumers).toEqual([signing]); expect(signing.run).toContain("--no-env-file --no-install");
  expect(sign.every(step => !/bun install|npm install|cargo |tauri|distribution\/verify/.test(String(step.run)))).toBe(true);
  expect(verify.every(step => !/bun install|npm install|cargo |tauri/.test(String(step.run)))).toBe(true);
  expect(build.some(step => step.run?.includes("bun install --frozen-lockfile --ignore-scripts"))).toBe(true);
  const prepareIndex = sign.findIndex(step => step.run?.includes("handoff.ts prepare")); expect(prepareIndex).toBeLessThan(sign.indexOf(signing)); expect(prepareIndex).toBeGreaterThan(0);
  expect(sign[prepareIndex]!.env.DESKTOP_INPUT_RECEIPT_SHA256).toBe("${{ needs.build.outputs.receipt_sha256 }}");
  expect(signing.env.DESKTOP_PREPARED_SHA256).toBe("${{ steps.prepare.outputs.tree_sha256 }}");
  expect(attest.some(step => step.uses?.startsWith("actions/checkout@"))).toBe(false);
  expect(attest.find(step => step.uses?.startsWith("actions/attest@"))!.with["subject-path"].trim().split("\n")).toHaveLength(3);
  for (const [steps, input] of [[sign, "build"], [verify, "sign"], [attest, "verify"], [publishSteps, "attest"]] as const) {
    const download = steps.find(step => step.uses?.startsWith("actions/download-artifact@"))!;
    expect(download.with["artifact-ids"]).toBe(input === "build" ? "${{ steps.artifact-input.outputs.artifact_id }}" : "${{ needs." + input + ".outputs.artifact_id }}"); expect(download.with.path).toStartWith("${{ runner.temp }}/");
  }
  const idGuard = sign.find(step => step.id === "artifact-input")!;
  const unsignedDownload = sign.find(step => step.uses?.startsWith("actions/download-artifact@"))!;
  expect(idGuard.run).toBe("bun --no-env-file --no-install desktop/distribution/artifact-id.ts");
  expect(idGuard.env).toEqual({ DESKTOP_BUILD_ARTIFACT_ID: "${{ needs.build.outputs.artifact_id }}" });
  expect(sign.indexOf(idGuard)).toBeGreaterThan(sign.findIndex(step => step.uses?.startsWith("oven-sh/setup-bun@")));
  expect(sign.indexOf(idGuard)).toBeLessThan(sign.indexOf(unsignedDownload));
  expect(sign.indexOf(unsignedDownload)).toBeLessThan(prepareIndex);
  expect(unsignedDownload.uses).toBe("actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131");
  expect(unsignedDownload.with.path).toBe("${{ runner.temp }}/ghostget-desktop-input");
  const attestGate = attest.find(step => step.env?.SIGNED_HANDOFF)!;
  expect(attestGate.env.SIGNED_HANDOFF).toBe("${{ needs.sign.outputs.handoff }}"); expect(attestGate.env.SIGNED_RECEIPT_SHA256).toBe("${{ needs.sign.outputs.receipt_sha256 }}");
  expect(attestGate.run).toContain("h.archive[key]===m.archive[key]"); expect(attestGate.run).toContain("h.signing.notarization[key]===m.notarization[key]");
  expect(publishSteps.find(step => step.env?.DESKTOP_SIGNED_HANDOFF)!.env.DESKTOP_SIGNED_HANDOFF).toBe("${{ needs.sign.outputs.handoff }}");
  for (const job of Object.values(jobs) as Json[]) for (const step of job.steps as Json[]) {
    if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/u);
    if (step.uses?.startsWith("actions/checkout@")) { expect(step.with.ref).toBe("${{ github.sha }}"); expect(step.with["persist-credentials"]).toBe(false); }
  }
});

test("artifact ID admission rejects lists, coercion, non-ASCII and output injection before emitting authority", () => {
  for (const invalid of [undefined, null, {}, [], 1, "", "0", "01", "-1", "+1", "1.0", "1e3", "0x10", "Infinity", "NaN", "1,2", "1,", " 1", "1 ", "1\t", "1\n", "1\r\n", "1\u2028", "1\u2029", "١", "１", "1/2", "../1", "1\nartifact_id=2", "9007199254740992", "999999999999999999999"]) {
    expect(() => admitArtifactId(invalid)).toThrow("one canonical positive safe-integer ID");
  }
  for (const valid of ["1", "123456789", String(Number.MAX_SAFE_INTEGER)]) expect(admitArtifactId(valid)).toBe(valid);
  fc.assert(fc.property(fc.bigInt({ min: 1n, max: BigInt(Number.MAX_SAFE_INTEGER) }), value => {
    const id = String(value); expect(admitArtifactId(id)).toBe(id);
    expect(() => admitArtifactId(`${id},2`)).toThrow();
    expect(() => admitArtifactId(`${id}\n`)).toThrow();
  }), { numRuns: 100 });
  const root = mkdtempSync("/tmp/ghostget-artifact-id-test-"), output = join(root, "output");
  try {
    for (const id of ["123", "1,2", "1\nartifact_id=2", "9007199254740992"]) {
      writeFileSync(output, "sentinel\n", { mode: 0o600 });
      const run = spawnSync(process.execPath, ["--no-env-file", "--no-install", new URL("artifact-id.ts", import.meta.url).pathname], {
        env: { DESKTOP_BUILD_ARTIFACT_ID: id, GITHUB_OUTPUT: output }, timeout: 5000, killSignal: "SIGKILL", maxBuffer: 16 * 1024, encoding: "utf8",
      });
      expect(run.error).toBeUndefined(); expect(run.stdout).toBe("");
      expect(run.status).toBe(id === "123" ? 0 : 1);
      expect(readFileSync(output, "utf8")).toBe(id === "123" ? "sentinel\nartifact_id=123\n" : "sentinel\n");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("strict source-bound handoffs prevent the executable verifier from substituting signer evidence", () => {
  const m = manifest(), h = parseHandoff({ schema: "ghostget.desktop-handoff/1", stage: "signed", repository: REPOSITORY, repositoryId: REPOSITORY_ID,
    canonicalTag: tag, sourceSha: source, sourceTree: m.sourceTree, workflow: WORKFLOW, workflowSha256: "f".repeat(64), lockSha256: "a".repeat(64), workflowId: 123, runId: 456, runAttempt: 1,
    archive: m.archive, signing: { teamId: m.teamId, signingIdentitySha1: m.signingIdentitySha1, notarization: m.notarization, runtimeInventorySha256: m.runtimeInventorySha256, signingInventorySha256: m.signingInventorySha256 } });
  expect(() => matchSignedManifest(m, h)).not.toThrow();
  for (const key of Object.keys(h)) { expect(() => parseHandoff({ ...h, [key]: null })).toThrow(); }
  expect(() => parseHandoff({ ...h, extra: true })).toThrow();
  for (const mutate of [(v: Json) => { v.sourceSha = "b".repeat(40); }, (v: Json) => { v.sourceTree = "c".repeat(40); }, (v: Json) => { v.runAttempt++; },
    (v: Json) => { v.archive.sha256 = "e".repeat(64); }, (v: Json) => { v.archive.bytes++; }, (v: Json) => { v.signing.runtimeInventorySha256 = "f".repeat(64); },
    (v: Json) => { v.signing.notarization.id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; }, (v: Json) => { v.signing.teamId = "DEF123ABC4"; }]) {
    const changed = structuredClone(h); mutate(changed); expect(() => matchSignedManifest(m, parseHandoff(changed))).toThrow();
  }
  fc.assert(fc.property(fc.string().filter(key => !Object.hasOwn(h, key)), fc.jsonValue(), (key, value) => expect(() => parseHandoff({ ...h, [key]: value })).toThrow()), { numRuns: 100 });
});

test("stdlib ZIP boundary rejects traversal, links, ambiguous metadata and preserves synthetic ditto xattrs", () => {
  const run = spawnSync("python3", ["-I", new URL("archive.test.py", import.meta.url).pathname], { timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024, encoding: "utf8" });
  expect(run.error).toBeUndefined(); expect(run.stderr).toContain("Ran 6 tests"); expect(run.status, run.stderr).toBe(0);
});



test("signed helper deadlines escalate TERM to KILL and bound uncertain custody", async () => {
  for (const outcome of ["normal", "term", "kill", "uncertain"] as const) {
    let exit: (code: number) => void = () => undefined;
    const signals: string[] = [];
    const exited = new Promise<number>(resolve => { exit = resolve; });
    const child = { exited, kill: (signal: "SIGTERM" | "SIGKILL") => { signals.push(signal); if (outcome === "term" || outcome === "kill" && signal === "SIGKILL") exit(1); } };
    const operation = async () => { if (outcome === "normal") { exit(0); return; } await new Promise<void>(() => undefined); };
    const result = verifyHelperLifecycle(child, operation, { operation: 2, term: 2, kill: 2 });
    if (outcome === "normal") { await result; expect(signals).toEqual([]); }
    else { await expect(result).rejects.toThrow(outcome === "uncertain" ? HelperCustodyUncertain : "deadline"); expect(signals).toEqual(outcome === "term" ? ["SIGTERM"] : ["SIGTERM", "SIGKILL"]); }
  }
});
