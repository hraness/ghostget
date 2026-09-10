import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import fc from "fast-check";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  MACOS_PATTERNED_TESTS,
  MACOS_TEST_FILES,
  assertMacosCheckFilesExist,
  macosCheckInvocations,
} from "./ci-macos-check.js";
import {
  CI_UNIT_TEST_SHARD_COUNT,
  assignUnitTestShards,
  bunUnitTestArguments,
  fileWeight,
  filesForShard,
  isSrcUnitTestFile,
  listSrcUnitTestFiles,
  parseShardRequest,
} from "./ci-test-shard.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageManifestUrl = new URL("../package.json", import.meta.url);
const ciWorkflowUrl = new URL("../.github/workflows/ci.yml", import.meta.url);

describe("PR CI test shards", () => {
  test("rejects malformed shard requests and extra fields", () => {
    expect(() => parseShardRequest(null)).toThrow("one object");
    expect(() => parseShardRequest({ shard: 1 })).toThrow("shard and shardCount");
    expect(() => parseShardRequest({ shard: 1, shardCount: 4, extra: true })).toThrow(
      "unexpected field extra",
    );
    expect(() => parseShardRequest({ shard: 0, shardCount: 4 })).toThrow("shard");
    expect(() => parseShardRequest({ shard: 5, shardCount: 4 })).toThrow("outside");
    expect(() => parseShardRequest({ shard: 1, shardCount: 17 })).toThrow("shardCount");
    expect(() => parseShardRequest({ shard: "01", shardCount: 4 })).toThrow("shard");
    expect(parseShardRequest({ shard: "2", shardCount: "4" })).toEqual({
      concurrency: 4,
      shard: 2,
      shardCount: 4,
    });
    expect(parseShardRequest({
      concurrency: "8",
      shard: 1,
      shardCount: 4,
    })).toEqual({
      concurrency: 8,
      shard: 1,
      shardCount: 4,
    });
  });

  test("lists every src unit test except the serialized omni runtime file", async () => {
    const files = await listSrcUnitTestFiles(repositoryRoot);
    expect(files.includes("src/omni-runtime.test.ts")).toBeFalse();
    expect(files.includes("src/messaging-runtime-execution.test.ts")).toBeTrue();
    expect(files.includes("src/media/http.integration.test.ts")).toBeTrue();
    expect(files.every((file) => isSrcUnitTestFile(file))).toBeTrue();
    expect(new Set(files).size).toBe(files.length);
  });

  test("packs the four CI shards into a disjoint cover of the unit inventory", async () => {
    const files = await listSrcUnitTestFiles(repositoryRoot);
    const shards = assignUnitTestShards(files, CI_UNIT_TEST_SHARD_COUNT);
    expect(shards).toHaveLength(CI_UNIT_TEST_SHARD_COUNT);
    const combined = shards.flat();
    expect([...combined].sort((left, right) => left.localeCompare(right))).toEqual([...files]);
    expect(new Set(combined).size).toBe(files.length);
    for (const [index, shard] of shards.entries()) {
      expect(shard.length).toBeGreaterThan(0);
      expect(await filesForShard(repositoryRoot, {
        concurrency: 4,
        shard: index + 1,
        shardCount: CI_UNIT_TEST_SHARD_COUNT,
      })).toEqual(shard);
    }
    const weights = shards.map((shard) =>
      shard.reduce((sum, file) => sum + fileWeight(file), 0)
    );
    const heaviest = Math.max(...weights);
    const lightest = Math.min(...weights);
    expect(heaviest - lightest).toBeLessThanOrEqual(fileWeight("src/messaging-runtime-execution.test.ts"));
    expect(bunUnitTestArguments(shards[0] ?? [], 4)).toContain("--no-orphans");
    expect(() => bunUnitTestArguments([], 4)).toThrow("without files");
  });

  test("property: shard assignment is a deterministic partition", async () => {
    const files = await listSrcUnitTestFiles(repositoryRoot);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (shardCount) => {
        const first = assignUnitTestShards(files, shardCount);
        const second = assignUnitTestShards(files, shardCount);
        expect(first).toEqual(second);
        expect(first.flat().sort((left, right) => left.localeCompare(right))).toEqual([...files]);
        expect(new Set(first.flat()).size).toBe(files.length);
        expect(first.every((shard) => shard.length > 0)).toBeTrue();
      }),
      { numRuns: 32 },
    );
  });
});

describe("macOS PR check subset", () => {
  test("keeps every darwin-owned file and the iMessage installer canary", async () => {
    await assertMacosCheckFilesExist(repositoryRoot);
    expect(MACOS_TEST_FILES).toContain("src/apple-photos-local-source.test.ts");
    expect(MACOS_TEST_FILES).toContain("src/imessage-direct-plugin.test.ts");
    expect(MACOS_TEST_FILES).toContain("src/provider-plugin-host.test.ts");
    expect(MACOS_PATTERNED_TESTS).toEqual([
      {
        file: "src/ghostget.test.ts",
        testNamePattern:
          "keeps public iMessage installer filesystem failures prompt and path-free",
      },
    ]);
    const invocations = macosCheckInvocations(4);
    expect(invocations[0]).toEqual([
      "test",
      "--no-orphans",
      "--timeout",
      "180000",
      "--max-concurrency",
      "4",
      ...MACOS_TEST_FILES,
    ]);
    expect(invocations[1]).toContain("--test-name-pattern");
    expect(invocations[1]).toContain("src/ghostget.test.ts");
  });
});

describe("complete local and release check composition", () => {
  test("records the aligned toolchain in every source job before frozen installation", async () => {
    type Step = { name?: string; uses?: string; if?: unknown; "continue-on-error"?: unknown; run?: string; with?: Record<string, unknown> };
    type Job = { name: string; "runs-on": string; "timeout-minutes": number; if?: unknown; "continue-on-error"?: unknown; strategy?: unknown; steps: Step[] };
    type Workflow = { jobs: Record<string, Job> };
    const workflow = Bun.YAML.parse(await readFile(ciWorkflowUrl, "utf8")) as Workflow;
    const sourceJobs = {
      static: ["static", "ubuntu-latest", 15],
      package: ["package", "ubuntu-latest", 20],
      test: ["test ${{ matrix.shard }}/4", "ubuntu-latest", 40],
      "test-omni": ["test-omni", "ubuntu-latest", 25],
      standalone: ["standalone", "ubuntu-latest", 20],
      macos: ["macOS", "macos-15", 25],
    } as const;
    const expectedNode = {
      uses: "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
      with: { "node-version": "24.20.0", "registry-url": "https://registry.npmjs.org", "package-manager-cache": false },
    };
    const expectedBun = {
      uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
      with: { "bun-version": "1.3.14" },
    };
    const expectedPin = {
      name: "Pin npm",
      run: [
        "set -euo pipefail",
        "npm install --global npm@11.19.0 \\",
        "  --ignore-scripts \\",
        "  --registry=https://registry.npmjs.org",
        'test "$(npm --version)" = "11.19.0"',
        "node -p 'JSON.stringify({ node: process.version, zlib: process.versions.zlib, platform: process.platform, arch: process.arch })'",
        "",
      ].join("\n"),
    };
    const record = { name: "Record exact source CI identity", run: "bun run ./scripts/release-source-ci.ts record" };
    const install = { run: "bun install --frozen-lockfile --ignore-scripts" };
    const validate = (candidate: Workflow): void => {
      if (!isDeepStrictEqual(Object.keys(candidate.jobs).sort(), [...Object.keys(sourceJobs), "required"].sort())) {
        throw new Error("Source CI job inventory changed");
      }
      for (const [id, metadata] of Object.entries(sourceJobs)) {
        const job = candidate.jobs[id];
        if (job === undefined || !isDeepStrictEqual([job.name, job["runs-on"], job["timeout-minutes"]], metadata)
          || job.if !== undefined || job["continue-on-error"] !== undefined
          || job.steps.some(step => step.if !== undefined || step["continue-on-error"] !== undefined)) {
          throw new Error(`Source CI job ${id} is conditional or changed its execution boundary`);
        }
        const findOne = (predicate: (step: Step) => boolean, expected: Step): number => {
          const indices = job.steps.flatMap((step, index) => predicate(step) ? [index] : []);
          if (indices.length !== 1 || !isDeepStrictEqual(job.steps[indices[0]!], expected)) {
            throw new Error(`Source CI job ${id} changed a required setup or identity step`);
          }
          return indices[0]!;
        };
        const nodeIndex = findOne(step => step.uses?.startsWith("actions/setup-node@") === true, expectedNode);
        const bunIndex = findOne(step => step.uses?.startsWith("oven-sh/setup-bun@") === true, expectedBun);
        const pinIndex = findOne(step => step.name === expectedPin.name, expectedPin);
        const recordIndex = findOne(step => step.name === record.name || step.run?.includes("release-source-ci.ts") === true, record);
        const installIndex = findOne(step => step.run?.includes("bun install") === true, install);
        if (nodeIndex >= pinIndex || Math.max(nodeIndex, bunIndex, pinIndex) >= recordIndex || recordIndex + 1 !== installIndex) {
          throw new Error(`Source CI job ${id} records before setup or after installation`);
        }
      }
      if (!isDeepStrictEqual(candidate.jobs.test?.strategy, { "fail-fast": false, matrix: { shard: [1, 2, 3, 4] } })) {
        throw new Error("Source CI no longer expands to all nine work jobs");
      }
    };
    expect(() => validate(workflow)).not.toThrow();
    const mutations: ((candidate: Workflow) => void)[] = [
      candidate => { delete candidate.jobs.macos; },
      candidate => { candidate.jobs.test!.strategy = { "fail-fast": false, matrix: { shard: [1, 2, 3] } }; },
      candidate => { candidate.jobs.static!["timeout-minutes"] = 5; },
      candidate => { candidate.jobs.static!.if = "always()"; },
      candidate => { candidate.jobs.static!["continue-on-error"] = true; },
      candidate => { candidate.jobs.static!.steps.find(step => step.uses?.startsWith("actions/setup-node@"))!.with!["node-version"] = "24"; },
      candidate => { candidate.jobs.static!.steps.find(step => step.uses?.startsWith("oven-sh/setup-bun@"))!.with!["bun-version"] = "latest"; },
      candidate => { candidate.jobs.static!.steps.find(step => step.name === expectedPin.name)!.run = "npm install --global npm@latest"; },
      candidate => { candidate.jobs.static!.steps = candidate.jobs.static!.steps.filter(step => step.name !== record.name); },
      candidate => { candidate.jobs.static!.steps.push({ ...record }); },
      candidate => { candidate.jobs.static!.steps.find(step => step.name === record.name)!.if = "always()"; },
      candidate => { candidate.jobs.static!.steps.find(step => step.name === record.name)!["continue-on-error"] = true; },
      candidate => { candidate.jobs.static!.steps.find(step => step.name === record.name)!.run = `${record.run} || true`; },
      candidate => { const steps = candidate.jobs.static!.steps; const index = steps.findIndex(step => step.name === record.name); steps.splice(1, 0, ...steps.splice(index, 1)); },
      candidate => { const steps = candidate.jobs.static!.steps; const index = steps.findIndex(step => step.name === record.name); steps.push(...steps.splice(index, 1)); },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(workflow);
      mutate(changed);
      expect(() => validate(changed)).toThrow();
    }
  });

  test("checks the release npm compressor and strict archive parser before tagging", async () => {
    type Step = { name?: string; uses?: string; if?: unknown; "continue-on-error"?: unknown; run?: string; with?: Record<string, unknown> };
    type Job = { if?: unknown; "continue-on-error"?: unknown; needs?: string[]; steps: Step[] };
    type Workflow = { jobs: Record<string, Job> };
    const [ciSource, releaseSource] = await Promise.all([
      readFile(ciWorkflowUrl, "utf8"),
      readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
    ]);
    const ci = Bun.YAML.parse(ciSource) as Workflow;
    const release = Bun.YAML.parse(releaseSource) as Workflow;
    const packageJob = ci.jobs.package;
    const releaseJob = release.jobs.verify;
    if (packageJob === undefined || releaseJob === undefined) throw new Error("Missing package gate");
    const node = (job: Job) => job.steps.find(step => step.uses?.startsWith("actions/setup-node@"));
    const pin = (job: Job) => job.steps.find(step => step.name === "Pin npm");
    expect(node(packageJob)).toEqual(node(releaseJob));
    expect(node(packageJob)?.with).toEqual({
      "node-version": "24.20.0",
      "registry-url": "https://registry.npmjs.org",
      "package-manager-cache": false,
    });
    expect(pin(packageJob)).toEqual(pin(releaseJob));
    expect(pin(packageJob)?.run).toContain('test "$(npm --version)" = "11.19.0"');
    expect(packageJob.if).toBeUndefined();
    expect(packageJob["continue-on-error"]).toBeUndefined();
    expect(packageJob.steps.every(step => step.if === undefined)).toBeTrue();
    expect(packageJob.steps.every(step => step["continue-on-error"] === undefined)).toBeTrue();
    const packed = packageJob.steps.find(step => step.name === "Check the canonical npm archive before tagging");
    const packing = 'npm pack --ignore-scripts --json --pack-destination "$directory" \\\n  --registry=https://registry.npmjs.org > "$directory/npm-pack.json"';
    if (packed === undefined) throw new Error("Missing canonical npm archive step");
    expect(packed.run).toContain(packing);
    expect(releaseJob.steps.find(step => step.name === "Prepare and install the exact canonical archive")?.run)
      .toContain(packing);
    expect(packed?.run).toContain('bun run ./scripts/package-artifact.ts "$directory/hraness-ghostget-$package_version.tgz"');
    expect(packed.run).toBe([
      "set -euo pipefail",
      'directory="$(mktemp -d "$RUNNER_TEMP/ghostget-canonical-ci.XXXXXX")"',
      'package_version="$(node -p \'require("./package.json").version\')"',
      packing,
      'cat "$directory/npm-pack.json"',
      'bun run ./scripts/package-artifact.ts "$directory/hraness-ghostget-$package_version.tgz"',
      "",
    ].join("\n"));
    expect(packageJob.steps.indexOf(packed)).toBeGreaterThan(
      packageJob.steps.findIndex(step => step.run === "bun run check:package"),
    );
    expect(ci.jobs.required?.needs).toContain("package");
  });

  test("keeps bun run check as the sequential union of the PR jobs", async () => {
    const manifest = JSON.parse(await readFile(packageManifestUrl, "utf8")) as {
      readonly scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.["check:static"]).toBe(
      "bun run typecheck && bun run check:effect && bun run website:check && bun run test:npm-release",
    );
    expect(manifest.scripts?.["check:package"]).toBe(
      "bun run build && bun run test:package",
    );
    expect(manifest.scripts?.["test:unit"]).toContain("./src");
    expect(manifest.scripts?.["test:unit"]).toContain("omni-runtime.test.ts");
    expect(manifest.scripts?.["test:omni"]).toContain("./src/omni-runtime.test.ts");
    expect(manifest.scripts?.test).toBe("bun run test:unit && bun run test:omni");
    expect(manifest.scripts?.check).toBe(
      "bun run check:static && bun run check:package && bun run test && bun run test:standalone",
    );
    expect(manifest.scripts?.["check:macos"]).toBe("bun run ./scripts/ci-macos-check.ts");
    expect(manifest.scripts?.["test:shard"]).toBe("bun run ./scripts/ci-test-shard.ts");
    expect(manifest.scripts?.["test:npm-release"]).toBe(
      "bun test --no-orphans --timeout 45000 --max-concurrency 1"
      + " ./scripts/release-ref-authority.test.ts ./scripts/npm-stage-workflow.test.ts"
      + " ./scripts/github-release-artifact.test.ts ./scripts/ci-pr-gate.test.ts",
    );
  });

  test("PR CI shards the complete Linux gate and keeps Required as the merge job", async () => {
    const workflow = await readFile(ciWorkflowUrl, "utf8");
    expect(workflow).toContain("bun run check:static");
    expect(workflow).toContain("bun run check:package");
    expect(workflow).toContain("bun run test:omni");
    expect(workflow).toContain("bun run test:standalone");
    expect(workflow).toContain("bun run check:macos");
    expect(workflow).toContain("bun run ./scripts/ci-test-shard.ts");
    expect(workflow).not.toMatch(/^      - run: bun run check$/gmu);
    expect(workflow).toContain("needs: [static, package, test, test-omni, standalone, macos]");
    expect(workflow).toContain(`shard: [${Array.from({ length: CI_UNIT_TEST_SHARD_COUNT }, (_, index) =>
      index + 1
    ).join(", ")}]`);
    expect(workflow).toContain(
      `bun run ./scripts/ci-test-shard.ts \${{ matrix.shard }} ${String(CI_UNIT_TEST_SHARD_COUNT)}`,
    );
    for (const entrypoint of [
      "dist/index.js",
      "dist/client.js",
      "dist/beeper-client.js",
      "dist/apple-photos-client.js",
      "dist/whatsapp-client.js",
      "dist/omni-client.js",
      "dist/messaging.js",
    ] as const) {
      expect(workflow).toContain(entrypoint);
    }
    expect(workflow).toContain("git status --porcelain --untracked-files=all -- dist bun.lock");
  });
});
