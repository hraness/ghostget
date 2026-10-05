import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fc from "fast-check";
import { assertAsyncProperty } from "../src/test-support.js";

import {
  assertReleaseTagNewerThanPublished,
  exactLatestPredecessor,
  exactWorkflowPublishedRelease,
  latestReleaseConvergenceBudget,
  requireLatestRelease,
  revalidateLatestReleaseProjection,
  releaseSourceReceipt,
  releaseWorkflowRunIdFromPublishedRelease,
  validateMatchingPublishedReleases,
  waitForLatestRelease,
} from "./release-provider-outcome.mjs";

const tag = "v0.17.0";
const sourceSha = "2".repeat(40);

import { releaseAssetNames, usesGithubReleaseAssets } from "../website/github-release-artifact.mjs";
import { releaseBody } from "../website/release-notes.mjs";

type FetchCall = Readonly<{ init: RequestInit; url: string }>;

function responseAt(
  url: string,
  body: BodyInit | null,
  init: ResponseInit,
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { configurable: false, value: url });
  return response;
}

function siteWithFetch(
  implementation: (url: string, init: RequestInit) => Promise<Response> | Response,
): Readonly<{ calls: FetchCall[]; site: GhostgetPublicSite }> {
  const calls: FetchCall[] = [];
  let nonce = 0;
  const fetchImplementation = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const exactInit = init ?? {};
    calls.push(Object.freeze({ init: exactInit, url }));
    return implementation(url, exactInit);
  };
  return Object.freeze({
    calls,
    site: new GhostgetPublicSite({
      fetchImplementation,
      nonce: () => `nonce-${String(++nonce).padStart(4, "0")}`,
    }),
  });
}

function cancellableResponse(
  url: string,
  {
    body = "blocked",
    headers = {},
    status = 200,
  }: Readonly<{
    body?: string;
    headers?: Readonly<Record<string, string>>;
    status?: number;
  }> = {},
): Readonly<{ cancelled: () => boolean; response: Response }> {
  let wasCancelled = false;
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      wasCancelled = true;
    },
    start(controller) {
      controller.enqueue(bytes);
    },
  });
  return Object.freeze({
    cancelled: () => wasCancelled,
    response: responseAt(url, stream, { headers, status }),
  });
}

function release(tagName: string, id: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    assets: usesGithubReleaseAssets(tagName) ? releaseAssetNames(tagName).map((name, index) => ({
      id: index + 1, name, size: 100, state: "uploaded", digest: `sha256:${"a".repeat(64)}`,
      browser_download_url: `https://github.com/hraness/ghostget/releases/download/${tagName}/${name}`,
      url: `https://api.github.com/repos/hraness/ghostget/releases/assets/${index + 1}`,
    })) : [],
    draft: false,
    id,
    immutable: true,
    prerelease: false,
    published_at: tagName === tag ? "2026-09-04T12:00:00Z" : "2026-09-03T12:00:00Z",
    tag_name: tagName,
    target_commitish: "main",
  });
}

describe("immutable Latest Release convergence", () => {
  test("waits on absolute bounded slots for an older eventual-consistency result", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const timeouts: number[] = [];
    const snapshots = [release("v0.16.4", 9), release(tag, 10)];
    let read = 0;
    const result = await waitForLatestRelease({
      api: {
        async get(endpoint: string, options: Readonly<{ timeoutMilliseconds: number }>) {
          expect(endpoint).toBe("/repos/hraness/ghostget/releases/latest");
          timeouts.push(options.timeoutMilliseconds);
          now += 1;
          return snapshots[Math.min(read++, snapshots.length - 1)];
        },
      },
      monotonicNow: () => now,
      predecessorRelease: release("v0.16.4", 9),
      repository: "hraness/ghostget",
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      },
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    });
    expect(result).toEqual({ attempts: 2, releaseId: 10, tag });
    expect(sleeps).toEqual([4_999]);
    expect(timeouts).toEqual([10_000, 10_000]);
    expect(now).toBe(5_001);
  });

  test("rejects supersession, identity drift, malformed state, and exhausted convergence", async () => {
    const run = (
      snapshots: readonly Readonly<Record<string, unknown>>[],
      overrides: Readonly<Record<string, unknown>> = {},
    ): Promise<unknown> => {
      let now = 0;
      let read = 0;
      return waitForLatestRelease({
        api: {
          async get(_endpoint: string, _options: Readonly<{ timeoutMilliseconds: number }>) {
            now += 1;
            return snapshots[Math.min(read++, snapshots.length - 1)];
          },
        },
        maxAttempts: 2,
        monotonicNow: () => now,
        pollIntervalMilliseconds: 0,
        predecessorRelease: release("v0.16.4", 9),
        repository: "hraness/ghostget",
        sleep: async () => {},
        targetRelease: release(tag, 10),
        verifiedTag: tag,
        ...overrides,
      });
    };
    await expect(run([release("v0.17.1", 11)]))
      .rejects.toThrow("changed from the pinned predecessor");
    await expect(run([release("v0.16.3", 8)]))
      .rejects.toThrow("changed from the pinned predecessor");
    await expect(run([{ ...release("v0.16.4", 9), published_at: "2026-09-02T12:00:00Z" }]))
      .rejects.toThrow("changed from the pinned predecessor");
    await expect(run([release(tag, 11)]))
      .rejects.toThrow("does not bind the immutable target Release");
    await expect(run([{ ...release(tag, 10), immutable: false }]))
      .rejects.toThrow("is not exact, published, and immutable");
    await expect(run([release("v0.16.4", 9)]))
      .rejects.toThrow("bounded attempt budget");
    await expect(run([{ ...release("v0.16.4", 9), tag_name: "v0.16.4-beta.1" }]))
      .rejects.toThrow("not one stable semantic-version tag");
  });

  test("fails closed on invalid, regressing, expired, or stuck timing", async () => {
    const api = {
      async get() {
        return release(tag, 10);
      },
    };
    for (const options of [
      { maxAttempts: 0 },
      { maxAttempts: 13 },
      { maxAttempts: 1.5 },
      { pollIntervalMilliseconds: -1 },
      { pollIntervalMilliseconds: 5_001 },
    ] as const) {
      await expect(waitForLatestRelease({
        api,
        predecessorRelease: release("v0.16.4", 9),
        repository: "hraness/ghostget",
        targetRelease: release(tag, 10),
        verifiedTag: tag,
        ...options,
      })).rejects.toThrow();
    }

    let clockRead = 0;
    await expect(waitForLatestRelease({
      api,
      monotonicNow: () => [10, 10, 9][clockRead++] ?? 9,
      predecessorRelease: release("v0.16.4", 9),
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    })).rejects.toThrow("monotonic clock regressed");

    let now = 0;
    await expect(waitForLatestRelease({
      api: {
        async get() {
          now = 60_001;
          return release(tag, 10);
        },
      },
      monotonicNow: () => now,
      predecessorRelease: release("v0.16.4", 9),
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    })).rejects.toThrow("did not converge as Latest within 60 seconds");

    await expect(waitForLatestRelease({
      api: {
        async get() {
          return release("v0.16.4", 9);
        },
      },
      maxAttempts: 2,
      monotonicNow: () => 0,
      predecessorRelease: release("v0.16.4", 9),
      repository: "hraness/ghostget",
      sleep: async () => {},
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    })).rejects.toThrow("sleep did not reach its monotonic schedule");

    expect(latestReleaseConvergenceBudget).toEqual({
      deadlineMilliseconds: 60_000,
      maxAttempts: 12,
      perRequestTimeoutMilliseconds: 10_000,
      pollIntervalMilliseconds: 5_000,
    });
    expect(Object.isFrozen(latestReleaseConvergenceBudget)).toBe(true);
  });

  test("admits only one exact immutable predecessor and requires existing Releases to be Latest", async () => {
    expect(exactLatestPredecessor(release("v0.16.4", 9), tag)).toEqual({
      release: release("v0.16.4", 9),
      tag: "v0.16.4",
    });
    for (const predecessor of [
      release(tag, 10),
      release("v0.17.1", 11),
      { ...release("v0.16.4", 9), immutable: false },
    ]) {
      expect(() => exactLatestPredecessor(predecessor, tag)).toThrow();
    }

    const calls: string[] = [];
    const exact = await requireLatestRelease({
      api: {
        async get(endpoint: string, options: Readonly<{ timeoutMilliseconds: number }>) {
          calls.push(endpoint);
          expect(options).toEqual({ timeoutMilliseconds: 10_000 });
          return release(tag, 10);
        },
      },
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    });
    expect(exact).toEqual({ releaseId: 10, tag });
    expect(calls).toEqual(["/repos/hraness/ghostget/releases/latest"]);

    await expect(requireLatestRelease({
      api: { async get() { return release("v0.16.4", 9); } },
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    })).rejects.toThrow("is no longer Latest");

    const workflowRunId = "88001";
    const releaseCoordinates = {
      repository: "hraness/ghostget",
      verifiedSha: sourceSha,
      verifiedTag: tag,
      workflowRunId,
    };
    const workflowRelease = {
      ...release(tag, 10),
      author: { id: 41898282, login: "github-actions[bot]", type: "Bot" },
      body: releaseSourceReceipt(releaseCoordinates),
      name: `Ghostget ${tag}`,
      target_commitish: "main",
    };
    expect(validateMatchingPublishedReleases(
      workflowRelease,
      workflowRelease,
      releaseCoordinates,
    )).toEqual({ releaseId: 10, tag });
    expect(() => validateMatchingPublishedReleases(
      { ...workflowRelease, id: 11 },
      workflowRelease,
      releaseCoordinates,
    )).toThrow("does not bind the immutable target Release");
  });

  test("terminally sandwiches the exact Release and rejects Latest drift after convergence", async () => {
    const calls: string[] = [];
    const result = await revalidateLatestReleaseProjection({
      api: {
        async get(endpoint: string, options: Readonly<{ timeoutMilliseconds: number }>) {
          calls.push(endpoint);
          expect(options).toEqual({ timeoutMilliseconds: 10_000 });
          return release(tag, 10);
        },
      },
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    });
    expect(result).toEqual({ releaseId: 10, tag });
    expect(calls).toEqual([
      `/repos/hraness/ghostget/releases/tags/${tag}`,
      "/repos/hraness/ghostget/releases/latest",
    ]);

    let read = 0;
    await expect(revalidateLatestReleaseProjection({
      api: {
        async get() {
          return read++ === 0 ? release(tag, 10) : release("v0.17.1", 11);
        },
      },
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    })).rejects.toThrow("is no longer Latest");

    await expect(revalidateLatestReleaseProjection({
      api: {
        async get() {
          return release(tag, 11);
        },
      },
      repository: "hraness/ghostget",
      targetRelease: release(tag, 10),
      verifiedTag: tag,
    })).rejects.toThrow("does not bind the immutable target Release");
  });
});


test("reads the historical immutable source receipt through the renamed repository coordinate", () => {
  const oldTag = "v0.16.12";
  const oldBody = `wrench-release-source-v1 repository=hraness/wrench tag=${oldTag} source_sha=${sourceSha} workflow_run_id=9001`;
  const release = { id: 99, tag_name: oldTag, target_commitish: sourceSha, draft: false,
    prerelease: false, immutable: true, assets: [], published_at: "2026-09-08T01:00:00Z",
    author: { id: 41898282, type: "Bot" }, body: oldBody };
  const coordinates = { repository: "hraness/ghostget", verifiedTag: oldTag, verifiedSha: sourceSha };
  expect(releaseWorkflowRunIdFromPublishedRelease({ ...coordinates, value: release })).toBe("9001");
  for (const body of [oldBody.replace("repository=hraness/wrench", "repository=hraness/ghostget"),
    oldBody.replace("repository=hraness/wrench", "repository=attacker/wrench"), oldBody.replace(sourceSha, "f".repeat(40))]) {
    expect(() => releaseWorkflowRunIdFromPublishedRelease({ ...coordinates, value: { ...release, body } })).toThrow();
  }
  expect(releaseSourceReceipt({ repository: "hraness/ghostget", verifiedSha: sourceSha,
    verifiedTag: "v0.17.0", workflowRunId: "9001" })).toContain("repository=hraness/ghostget tag=v0.17.0");
});

test("reads the source receipt from the trailing identity comment of a release page", () => {
  const pageTag = "v0.19.0";
  const receipt = releaseSourceReceipt({ repository: "hraness/ghostget", verifiedSha: sourceSha, verifiedTag: pageTag, workflowRunId: "9001" });
  const identity = `${receipt}\n\nghostget-release-attempt-v1 run_attempt=2`;
  const notes = "Ghostget reads one more source.\n\n## Changes\n\n- Read one more source.";
  const page = { ...release(pageTag, 99), target_commitish: sourceSha,
    author: { id: 41898282, type: "Bot" }, body: releaseBody(notes, identity) };
  const coordinates = { repository: "hraness/ghostget", verifiedTag: pageTag, verifiedSha: sourceSha };
  expect(releaseWorkflowRunIdFromPublishedRelease({ ...coordinates, value: page })).toBe("9001");
  expect(exactWorkflowPublishedRelease({ ...coordinates, workflowRunId: "9001", value: page })).toBe(page);
  for (const body of [
    identity,
    `${receipt}\n\n${notes}`,
    `${page.body}\n`,
    page.body.replace("workflow_run_id=9001", "workflow_run_id=9002"),
    `<!-- ${identity} -->\n\n${notes}`,
  ]) {
    expect(() => exactWorkflowPublishedRelease({ ...coordinates, workflowRunId: "9001", value: { ...page, body } })).toThrow();
  }
  expect(() => releaseWorkflowRunIdFromPublishedRelease({ ...coordinates, value: { ...page, body: identity } })).toThrow();
});

// Completed stable-Release ordering census. Each generated inventory is served
// through GitHub's 100-item pages; the oracle below restates the ordering law
// independently: a stable target must exceed every completed (published,
// non-prerelease) stable Release, each such Release must be immutable with an
// exact timestamp, and only an explicit existing-target check admits the one
// equal tag.
type CensusEntry = Readonly<{ tag: string; draft: boolean; prerelease: boolean; immutable: boolean; publishedAt: string | null }>;
const censusTag = fc.oneof(
  // Minors and patches of different digit counts separate numeric from lexicographic order.
  { weight: 8, arbitrary: fc.tuple(fc.constantFrom(9, 15, 16, 17, 18, 100), fc.constantFrom(0, 1, 2, 3, 10))
    .map(([minor, patch]) => `v0.${minor}.${patch}`) },
  { weight: 1, arbitrary: fc.constantFrom("v0.17.1-beta.1", "v0.17.01", "nightly", "v1.0.0", "v0.17.0", "v0.16.99") },
);
const censusEntry: fc.Arbitrary<CensusEntry> = fc.record({
  tag: censusTag,
  draft: fc.boolean(),
  prerelease: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  immutable: fc.oneof({ weight: 12, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  publishedAt: fc.oneof({ weight: 12, arbitrary: fc.constant<string | null>("2026-09-03T12:00:00Z") },
    { weight: 1, arbitrary: fc.constantFrom<string | null>(null, "2026-09-03T12:00:00.000Z", "2026-02-30T12:00:00Z") }),
});
const censusInventory = fc.oneof(
  { weight: 10, arbitrary: fc.array(censusEntry, { maxLength: 40 }) },
  { weight: 1, arbitrary: fc.tuple(fc.integer({ min: 95, max: 520 }), censusEntry)
    .map(([count, entry]) => Array.from({ length: count }, (_, index) => index === count - 1 ? entry
      : { tag: "v0.15.0", draft: false, prerelease: false, immutable: true, publishedAt: "2026-09-03T12:00:00Z" })) },
);
const stableParts = (value: string): readonly number[] | undefined =>
  /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(value)?.slice(1).map(Number);
function censusOracle(entries: readonly CensusEntry[], target: string, allowExistingTarget: boolean): boolean {
  if (entries.length > 500) return false;
  const next = stableParts(target)!; let equal = 0;
  for (const entry of entries) {
    const current = stableParts(entry.tag);
    if (entry.draft || entry.prerelease || current === undefined) continue;
    if (!entry.immutable || entry.publishedAt !== "2026-09-03T12:00:00Z") return false;
    const order = next.map((part, index) => part - current[index]!).find(delta => delta !== 0) ?? 0;
    if (order === 0 && allowExistingTarget && entry.tag === target) { equal += 1; continue; }
    if (order <= 0) return false;
  }
  return !allowExistingTarget || equal === 1;
}

describe("completed stable-Release ordering census", () => {
  test("property: the census admits a target exactly when it exceeds every completed stable Release in the bounded inventory", async () => {
    await assertAsyncProperty(fc.asyncProperty(censusInventory, fc.constantFrom("v0.17.0", "v0.16.2", "v0.18.0"), fc.boolean(),
      async (entries, target, allowExistingTarget) => {
        const reads: string[] = [];
        const api = {
          async get(endpoint: string) {
            reads.push(endpoint);
            const page = Number(/^\/repos\/hraness\/ghostget\/releases\?per_page=100&page=([1-6])$/u.exec(endpoint)?.[1]);
            expect(Number.isInteger(page)).toBe(true);
            return entries.slice((page - 1) * 100, page * 100).map((entry, index) => ({
              id: (page - 1) * 100 + index + 1, tag_name: entry.tag, draft: entry.draft, prerelease: entry.prerelease,
              immutable: entry.immutable, published_at: entry.publishedAt,
            }));
          },
        };
        const admitted = await assertReleaseTagNewerThanPublished({ allowExistingTarget, api, repository: "hraness/ghostget", verifiedTag: target })
          .then(() => true, () => false);
        expect(admitted).toBe(censusOracle(entries, target, allowExistingTarget));
        // An admitted census always read the complete six-page window, ending on the empty sentinel.
        if (admitted) expect(reads).toEqual([1, 2, 3, 4, 5, 6].map(page => `/repos/hraness/ghostget/releases?per_page=100&page=${page}`));
      }));
  });
});

// Latest convergence. Each generated schedule chooses what GitHub's Latest
// projection returns on each read, how long each read takes, how the sleeper
// behaves, and whether the monotonic clock regresses once. The laws hold for
// every schedule; the progress law holds under its stated environment.
type LatestObservation = "predecessor" | "target" | "third" | "older" | "predecessor-drift" | "target-drift" | "malformed";
const latestObservation = fc.oneof(
  { weight: 12, arbitrary: fc.constant<LatestObservation>("predecessor") },
  { weight: 4, arbitrary: fc.constant<LatestObservation>("target") },
  { weight: 1, arbitrary: fc.constantFrom<LatestObservation>("third", "older", "predecessor-drift", "target-drift", "malformed") },
);
const latestSnapshot = (observation: LatestObservation): unknown => ({
  predecessor: release("v0.16.4", 9), target: release(tag, 10), third: release("v0.17.1", 11), older: release("v0.16.3", 8),
  "predecessor-drift": { ...release("v0.16.4", 9), published_at: "2026-09-02T12:00:00Z" },
  "target-drift": release(tag, 12), malformed: { ...release(tag, 10), immutable: false },
})[observation];

describe("Latest convergence schedule", () => {
  test("property: Latest converges only through the exact predecessor to the exact target inside twelve absolute slots and 60 seconds", async () => {
    await assertAsyncProperty(fc.asyncProperty(
      fc.array(fc.tuple(latestObservation, fc.oneof({ weight: 6, arbitrary: fc.integer({ min: 0, max: 400 }) },
        { weight: 2, arbitrary: fc.integer({ min: 0, max: 70_000 }) })), { minLength: 1, maxLength: 14 }),
      fc.oneof({ weight: 6, arbitrary: fc.constant(1) }, { weight: 1, arbitrary: fc.constantFrom(0, 0.5, 3) }),
      fc.option(fc.integer({ min: 1, max: 40 }), { nil: undefined, freq: 5 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      // Production uses the 5-second default; shorter admitted intervals exercise the attempt cap.
      fc.oneof({ weight: 4, arbitrary: fc.constant(5_000) }, { weight: 1, arbitrary: fc.constantFrom(0, 1_000) }),
      async (schedule, sleepFactor, regressAt, start, interval) => {
        let now = start; let clockReads = 0; let reads = 0;
        const starts: number[] = []; const timeouts: number[] = []; const readings: number[] = [];
        const monotonicNow = (): number => {
          clockReads += 1;
          readings.push(regressAt === clockReads ? now - 1 : now);
          return readings.at(-1)!;
        };
        const result = await waitForLatestRelease({
          api: {
            async get(endpoint: string, options: Readonly<{ timeoutMilliseconds: number }>) {
              expect(endpoint).toBe("/repos/hraness/ghostget/releases/latest");
              starts.push(now); timeouts.push(options.timeoutMilliseconds);
              const [observation, latency] = schedule[Math.min(reads, schedule.length - 1)]!;
              reads += 1; now += latency;
              return latestSnapshot(observation);
            },
          },
          monotonicNow,
          ...(interval === 5_000 ? {} : { pollIntervalMilliseconds: interval }),
          predecessorRelease: release("v0.16.4", 9),
          repository: "hraness/ghostget",
          sleep: async (milliseconds: number) => { now += Math.floor(milliseconds * sleepFactor); },
          targetRelease: release(tag, 10),
          verifiedTag: tag,
        }).then(value => ({ ok: true as const, value }), () => ({ ok: false as const }));
        const seen = starts.map((_, index) => schedule[Math.min(index, schedule.length - 1)]![0]);
        // Slots and the deadline are anchored at the first monotonic reading.
        const anchor = readings[0]!;
        const regressed = readings.some((value, index) => index > 0 && value < readings[index - 1]!);
        // Safety: at most twelve reads, each starting on or after its absolute
        // five-second slot and strictly before the 60-second deadline, each
        // bounded by the smaller of 10 seconds and the time remaining.
        expect(reads).toBeLessThanOrEqual(12);
        starts.forEach((instant, index) => {
          expect(instant).toBeGreaterThanOrEqual(anchor + index * interval);
          expect(instant).toBeLessThan(anchor + 60_000);
          expect(timeouts[index]).toBeLessThanOrEqual(Math.min(10_000, Math.floor(anchor + 60_000 - instant) + 1));
        });
        // Only the exact predecessor may precede the result; anything else ends the wait.
        seen.slice(0, -1).forEach(observation => expect(observation).toBe("predecessor"));
        if (result.ok) {
          expect(seen.at(-1)).toBe("target");
          expect(result.value).toEqual({ attempts: reads, releaseId: 10, tag });
          expect(now).toBeLessThanOrEqual(anchor + 60_000);
          expect(regressed).toBe(false);
        }
        // Progress: an exact predecessor-then-target projection that fits the
        // slots, an accurate sleeper, and a monotonic clock always converge.
        const firstTarget = schedule.findIndex(([observation]) => observation !== "predecessor");
        const fits = firstTarget >= 0 && firstTarget < 12 && schedule[firstTarget]![0] === "target"
          && schedule.slice(0, firstTarget + 1).every(([, latency]) => latency <= 400);
        if (fits && (sleepFactor === 1 || interval === 0) && regressAt === undefined) expect(result).toEqual({ ok: true, value: { attempts: firstTarget + 1, releaseId: 10, tag } });
      }));
  });
});
