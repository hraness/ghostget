import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { assertAsyncProperty } from "../src/test-support.js";
import { releaseBody, releaseNotesSha256 } from "../website/release-notes.mjs";

// A property over reruns of the npm mirror. Each generated attempt runs the
// real "Admit absent or exact public registry state" and "Publish exact
// canonical archive through npm trusted publishing" step scripts from
// release.yml against one stateful fake registry. The generator chooses the
// registry's starting state (absent, or already holding other bytes), and per
// attempt whether the version read is stale (registry lag) or fails, and how
// `npm publish` answers: normally, with an error after the write landed (an
// ambiguous write), with an error before any write, or with a malformed
// receipt after the write landed. The fake registry is immutable per version,
// like npm: a second publish of a held version is refused.

const releaseWorkflowUrl = new URL("../.github/workflows/release.yml", import.meta.url);
const repository = fileURLToPath(new URL("../", import.meta.url));
const version = "0.17.9";
const tag = `v${version}`;
const sourceSha = "a".repeat(40);
const archive = Buffer.from("canonical ghostget archive bytes\n", "utf8");
const foreignArchive = Buffer.from("other bytes under the same version\n", "utf8");
const archiveSha256 = createHash("sha256").update(archive).digest("hex");
const integrityOf = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const canonicalIntegrity = integrityOf(archive);
const foreignIntegrity = integrityOf(foreignArchive);

const releaseNotes = "Ghostget reads one more source.\n\n## Changes\n\n- Read one more source.";

const release = {
  id: 9001, tag_name: tag, target_commitish: sourceSha, draft: false, prerelease: false, immutable: true,
  author: { id: 41898282, type: "Bot" },
  body: releaseBody(releaseNotes, `wrench-release-source-v1 repository=hraness/ghostget tag=${tag} source_sha=${sourceSha} workflow_run_id=123456\n\nghostget-release-attempt-v1 run_attempt=1`),
  assets: [
    { name: `hraness-ghostget-${version}.tgz`, state: "uploaded", digest: `sha256:${archiveSha256}`, size: archive.byteLength },
    { name: "npm-pack.json", state: "uploaded", digest: `sha256:${"1".repeat(64)}`, size: 10 },
    { name: "release-manifest.json", state: "uploaded", digest: `sha256:${"2".repeat(64)}`, size: 10 },
    { name: "SHA256SUMS", state: "uploaded", digest: `sha256:${"3".repeat(64)}`, size: 10 },
    { name: "provenance.jsonl", state: "uploaded", digest: `sha256:${"4".repeat(64)}`, size: 10 },
  ],
};

// The fake registry keeps its state in files so the step scripts' child
// processes share it. `held` is the integrity npm holds for the version;
// `stale` makes the next version and latest reads answer as if nothing were
// held; `outage` makes the next version read fail; `publish-fault` chooses how
// the next publish answers. Every publish command is appended to `publishes`.
const fakeNpm = `#!/bin/bash
set -euo pipefail
state="$REGISTRY_STATE"
consume() { local value; value="$(cat "$state/$1" 2>/dev/null || true)"; rm -f "$state/$1"; printf '%s' "$value"; }
if [[ "$1" == config && "$2" == get && "$3" == tag ]]; then printf 'latest\\n'; exit 0; fi
if [[ "$1" == view && "$2" == "@hraness/ghostget@${version}" ]]; then
  if [[ "$(consume outage)" == 1 ]]; then echo 'npm error code ECONNRESET' >&2; exit 1; fi
  stale="$(cat "$state/stale" 2>/dev/null || true)"
  if [[ ! -f "$state/held" || "$stale" == 1 ]]; then echo 'npm error code E404' >&2; exit 1; fi
  printf '{"name":"@hraness/ghostget","version":"%s","dist":{"integrity":"%s","tarball":"https://registry.npmjs.org/@hraness/ghostget/-/ghostget-%s.tgz"}}\\n' "${version}" "$(cat "$state/held")" "${version}"
  exit 0
fi
if [[ "$1" == view && "$2" == "@hraness/ghostget" && "$3" == dist-tags.latest ]]; then
  if [[ "$(consume stale)" == 1 || ! -f "$state/held" ]]; then printf '"0.17.8"\\n'; else printf '"${version}"\\n'; fi
  exit 0
fi
if [[ "$1" == publish ]]; then
  printf '%s\\n' "$2" >> "$state/publishes"
  fault="$(consume publish-fault)"
  if [[ "$fault" == fail-before ]]; then echo 'npm error code ETIMEDOUT' >&2; exit 1; fi
  if [[ -f "$state/held" ]]; then echo 'npm error code E403 You cannot publish over the previously published versions' >&2; exit 1; fi
  integrity="sha512-$(openssl dgst -sha512 -binary "$2" | openssl base64 -A)"
  printf '%s' "$integrity" > "$state/held"
  if [[ "$fault" == lost-after ]]; then echo 'npm error code ECONNRESET' >&2; exit 1; fi
  if [[ "$fault" == malformed ]]; then printf '{"unexpected":true}\\n'; exit 0; fi
  printf '{"@hraness/ghostget":{"id":"@hraness/ghostget@%s","name":"@hraness/ghostget","version":"%s","integrity":"%s","filename":"hraness-ghostget-%s.tgz"}}\\n' "${version}" "${version}" "$integrity" "${version}"
  exit 0
fi
exit 98
`;

const fakeGh = `#!/bin/bash
set -euo pipefail
[[ "$1" == api && "$2" == --method && "$3" == GET && "$4" == "/repos/hraness/ghostget/releases/tags/${tag}" ]] || exit 97
cat "$RELEASE_FIXTURE"
`;

function workflowStepScript(workflow: string, name: string): string {
  const stepStart = workflow.indexOf(`      - name: ${name}\n`);
  if (stepStart < 0) throw new Error(`Workflow step not found: ${name}`);
  const runMarker = "        run: |\n";
  const runStart = workflow.indexOf(runMarker, stepStart);
  if (runStart < 0) throw new Error(`Workflow step has no run script: ${name}`);
  const script: string[] = [];
  for (const line of workflow.slice(runStart + runMarker.length).split("\n")) {
    if (line.length === 0) { script.push(""); continue; }
    if (!line.startsWith("          ")) break;
    script.push(line.slice(10));
  }
  return script.join("\n");
}

async function runScript(script: string, environment: Readonly<Record<string, string>>): Promise<number> {
  const child = Bun.spawn(["/bin/bash", "-c", script], {
    cwd: repository, env: { ...process.env, ...environment }, stderr: "pipe", stdout: "pipe",
  });
  const [exitCode] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()]);
  return exitCode;
}

type PublishFault = "none" | "lost-after" | "fail-before" | "malformed";
type Attempt = Readonly<{ stale: boolean; outage: boolean; publish: PublishFault }>;
type Outcome = Readonly<{
  admitted: "absent" | "exact" | null;
  publishes: number;
  succeeded: boolean;
  heldBefore: string | null;
  heldAfter: string | null;
  visibleBefore: boolean;
}>;

type Harness = Readonly<{
  attempt: (attempt: Attempt) => Promise<Outcome>;
  reset: (held: string | null) => Promise<void>;
  close: () => Promise<void>;
}>;

async function harness(workflow: string): Promise<Harness> {
  const admission = workflowStepScript(workflow, "Admit absent or exact public registry state");
  const publication = workflowStepScript(workflow, "Publish exact canonical archive through npm trusted publishing");
  const root = await mkdtemp(join(tmpdir(), "ghostget-npm-model-"));
  const bin = join(root, "bin"); const npmDirectory = join(root, "clean"); const state = join(root, "registry");
  const tarball = join(root, `hraness-ghostget-${version}.tgz`); const output = join(root, "github-output.txt");
  await mkdir(bin); await mkdir(npmDirectory);
  await writeFile(tarball, archive);
  await writeFile(join(root, "userconfig"), ""); await writeFile(join(root, "globalconfig"), "");
  await writeFile(join(root, "release.json"), JSON.stringify(release));
  await writeFile(join(bin, "npm"), fakeNpm); await writeFile(join(bin, "gh"), fakeGh);
  await chmod(join(bin, "npm"), 0o755); await chmod(join(bin, "gh"), 0o755);
  const environment = {
    DEFAULT_BRANCH: "main", EXPECTED_ARCHIVE_SHA256: archiveSha256, EXPECTED_RELEASE_ATTEMPT: "1",
    EXPECTED_RELEASE_NOTES_SHA256: releaseNotesSha256(releaseNotes),
    EXPECTED_TARBALL_SHA256: archiveSha256, EXPECTED_VERSION: version, GITHUB_OUTPUT: output,
    GITHUB_REF: `refs/tags/${tag}`, GITHUB_REPOSITORY: "hraness/ghostget", GITHUB_RUN_ID: "123456", GITHUB_SHA: sourceSha,
    NPM_DIRECTORY: npmDirectory, NPM_GLOBALCONFIG: join(root, "globalconfig"), NPM_USERCONFIG: join(root, "userconfig"),
    PATH: `${bin}:${process.env.PATH ?? ""}`, REGISTRY_STATE: state, RELEASE_FIXTURE: join(root, "release.json"),
    RUNNER_TEMP: root, TARBALL: tarball, VERIFIED_SHA: sourceSha, VERIFIED_TAG: tag,
  };
  const readHeld = async () => existsSync(join(state, "held")) ? await readFile(join(state, "held"), "utf8") : null;
  const publishCount = async () => existsSync(join(state, "publishes"))
    ? (await readFile(join(state, "publishes"), "utf8")).split("\n").filter(Boolean).length : 0;
  const readOutput = async () => existsSync(output) ? await readFile(output, "utf8") : "";
  return {
    reset: async (held) => {
      await rm(state, { force: true, recursive: true }); await mkdir(state);
      if (held !== null) await writeFile(join(state, "held"), held);
    },
    attempt: async ({ stale, outage, publish }) => {
      const heldBefore = await readHeld(); const before = await publishCount();
      await rm(output, { force: true });
      await writeFile(join(state, "stale"), stale ? "1" : "0");
      await writeFile(join(state, "outage"), outage ? "1" : "0");
      await writeFile(join(state, "publish-fault"), publish);
      const admitExit = await runScript(admission, environment);
      const admittedOutput = await readOutput();
      const admitted = admitExit !== 0 ? null
        : admittedOutput === "npm_state=absent\n" ? "absent" as const
          : admittedOutput === "npm_state=exact\n" ? "exact" as const : null;
      if (admitExit === 0 && admitted === null) throw new Error(`Unexpected admission output ${JSON.stringify(admittedOutput)}`);
      let succeeded = false;
      if (admitted !== null) {
        await rm(output, { force: true });
        succeeded = await runScript(publication, { ...environment, NPM_STATE: admitted }) === 0;
      }
      await rm(join(state, "stale"), { force: true }); await rm(join(state, "outage"), { force: true });
      await rm(join(state, "publish-fault"), { force: true });
      return {
        admitted, heldAfter: await readHeld(), heldBefore, publishes: await publishCount() - before, succeeded,
        visibleBefore: heldBefore !== null && !stale && !outage,
      };
    },
    close: () => rm(root, { force: true, recursive: true }),
  };
}

const attempts = fc.array(fc.record({
  outage: fc.oneof({ weight: 4, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  publish: fc.constantFrom<PublishFault>("none", "none", "lost-after", "fail-before", "malformed"),
  stale: fc.oneof({ weight: 2, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
}), { minLength: 1, maxLength: 4 });

// Each attempt spawns two step scripts, so the run count stays small; the
// interrupt keeps one loaded runner inside the per-test timeout.
const NPM_MODEL_PROPERTY = { numRuns: 8, interruptAfterTimeLimit: 25_000 } as const;

async function checkRun(h: Harness, start: "absent" | "foreign", schedule: readonly Attempt[]): Promise<void> {
  await h.reset(start === "foreign" ? foreignIntegrity : null);
  for (const step of schedule) {
    const outcome = await h.attempt(step);
    // One attempt issues at most one publish command, and only after admission
    // recorded an absent version.
    expect(outcome.publishes).toBeLessThanOrEqual(1);
    if (outcome.publishes === 1) expect(outcome.admitted).toBe("absent");
    // A publication the registry readback shows is never published again.
    if (outcome.visibleBefore) expect(outcome.publishes).toBe(0);
    // A held version never changes bytes.
    if (outcome.heldBefore !== null) expect(outcome.heldAfter).toBe(outcome.heldBefore);
    // Success means npm holds exactly the canonical bytes; foreign bytes never succeed.
    if (outcome.succeeded) expect(outcome.heldAfter).toBe(canonicalIntegrity);
    if (outcome.heldBefore === foreignIntegrity) expect(outcome.succeeded).toBe(false);
    // An ambiguous or failed write never reports success.
    if (outcome.publishes === 1 && step.publish !== "none") expect(outcome.succeeded).toBe(false);
    // Progress: a readback that shows the canonical bytes skips and succeeds;
    // a clean attempt against an absent version publishes once and succeeds.
    if (outcome.visibleBefore && outcome.heldBefore === canonicalIntegrity) {
      expect(outcome.admitted).toBe("exact");
      expect(outcome.succeeded).toBe(true);
    }
    if (outcome.heldBefore === null && !step.outage && step.publish === "none") {
      expect(outcome.publishes).toBe(1);
      expect(outcome.succeeded).toBe(true);
    }
  }
}

describe("npm publication reruns", () => {
  test("property: each attempt issues at most one npm publish, only after an absent readback, and never changes a held version", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const h = await harness(workflow);
    try {
      await assertAsyncProperty(
        fc.asyncProperty(fc.constantFrom<"absent" | "foreign">("absent", "absent", "absent", "foreign"), attempts,
          (start, schedule) => checkRun(h, start, schedule)),
        NPM_MODEL_PROPERTY,
      );
    } finally {
      await h.close();
    }
  });

  test("an ambiguous npm write is resolved by the next attempt's readback, not by a second publish", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const h = await harness(workflow);
    try {
      await h.reset(null);
      const lost = await h.attempt({ outage: false, publish: "lost-after", stale: false });
      expect(lost).toMatchObject({ admitted: "absent", publishes: 1, succeeded: false, heldAfter: canonicalIntegrity });
      const rerun = await h.attempt({ outage: false, publish: "none", stale: false });
      expect(rerun).toMatchObject({ admitted: "exact", publishes: 0, succeeded: true, heldAfter: canonicalIntegrity });
    } finally {
      await h.close();
    }
  });

  test("under registry lag a rerun can issue a second publish, which the registry's version immutability refuses", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const h = await harness(workflow);
    try {
      await h.reset(null);
      const first = await h.attempt({ outage: false, publish: "malformed", stale: false });
      expect(first).toMatchObject({ admitted: "absent", publishes: 1, succeeded: false, heldAfter: canonicalIntegrity });
      const lagged = await h.attempt({ outage: false, publish: "none", stale: true });
      expect(lagged).toMatchObject({ admitted: "absent", publishes: 1, succeeded: false, heldAfter: canonicalIntegrity });
      const caughtUp = await h.attempt({ outage: false, publish: "none", stale: false });
      expect(caughtUp).toMatchObject({ admitted: "exact", publishes: 0, succeeded: true });
    } finally {
      await h.close();
    }
  });
});
