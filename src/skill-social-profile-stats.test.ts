import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { bundledContractCatalog } from "./contracts-bundled.test-support";
import { checkCollectionPlan } from "./contracts-check";
import { parseCollectionPlan, type CollectionPlanV1 } from "./contracts-plan";

const skillRoot = join(import.meta.dir, "..", "skills", "ghostget");
const manifestPath = join(
  skillRoot,
  "references",
  "hraness-social-profile-stats.json",
);
const referencePath = join(skillRoot, "references", "social-profile-stats.md");
/** Reads the bundled catalog currently runs without an auth locator. */
const currentPublicOperationCoordinates = new Set([
  "bluesky/profiles.read",
  "github/organizations.read",
  "github/profiles.read",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function readSourceManifest(): unknown {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
}

function parseCollectionManifest(value: unknown): CollectionPlanV1 {
  const plan = parseCollectionPlan(value);
  if (plan.collectionKey !== "hraness-social-profile-statistics") {
    throw new Error("manifest.collectionKey is invalid");
  }
  for (const [index, account] of plan.accounts.entries()) {
    const providers = new Set(account.reads.map((read) => read.expectedOutput.provider));
    if (providers.size !== 1) throw new Error(`manifest.accounts[${String(index)}].reads must use one provider`);
    const metricKeys = account.reads.flatMap((read) => read.metricKeys);
    if (new Set(metricKeys).size !== metricKeys.length) {
      throw new Error(`manifest.accounts[${String(index)}].reads must not overlap metric keys`);
    }
  }
  return plan;
}

function mutableManifest(): Record<string, unknown> {
  return structuredClone(readSourceManifest()) as Record<string, unknown>;
}

function firstRead(value: Record<string, unknown>): Record<string, unknown> {
  const accounts = value.accounts as Record<string, unknown>[];
  return (accounts[0]!.reads as Record<string, unknown>[])[0]!;
}

const catalog = bundledContractCatalog();

function checkAgainstBundledCatalog(manifest: CollectionPlanV1) {
  return checkCollectionPlan(manifest, catalog);
}

describe("packaged Hraness social-profile collection contract", () => {
  test("strictly binds the current ordered accounts, targets, metrics, and gaps", () => {
    const manifest = parseCollectionManifest(readSourceManifest());
    expect(manifest.accounts.map((account) => account.accountKey)).toEqual([
      "x-hraness",
      "x-aichartsio",
      "linkedin-personal",
      "linkedin-company-hraness",
      "youtube-hraness",
      "twitch-hranessdotcom",
      "bluesky-hraness",
      "instagram-hraness",
      "threads-hraness",
      "substack-hraness",
      "github-0thernet",
      "github-hraness",
      "tiktok-hraness",
      "reddit-bgdotjpg",
    ]);

    const byKey = new Map(manifest.accounts.map((account) => [account.accountKey, account]));
    expect(byKey.get("x-aichartsio")?.reads[0]).toMatchObject({
      input: { handle: "aichartsio" },
      expectedOutput: { targetUrl: "https://x.com/aichartsio" },
    });
    expect(byKey.get("linkedin-company-hraness")?.reads[0]?.requiredDelayBeforeMs)
      .toBe(60_000);
    expect(byKey.get("twitch-hranessdotcom")?.reads[0]).toMatchObject({
      authority: { kind: "auth", authId: "twitch-chrome" },
      expectedOutput: { targetUrl: "https://www.twitch.tv/hranessdotcom" },
      metricKeys: ["followers"],
    });
    expect(byKey.get("github-0thernet")?.reads[0]).toMatchObject({
      operation: "profiles.read",
      input: { username: "0thernet" },
      metricKeys: ["followers", "following", "publicRepositories"],
    });
    expect(byKey.get("github-hraness")?.reads[0]).toMatchObject({
      operation: "organizations.read",
      authority: { kind: "public" },
      input: { organization: "hraness" },
      metricKeys: ["stars", "followers"],
    });
    expect(byKey.get("threads-hraness")?.reads[0]?.expectedCategoricalGaps).toEqual([
      {
        metricKey: "recentViews",
        reason: "not-authorized",
        until: "account-eligible",
      },
    ]);
    expect(readFileSync(manifestPath, "utf8")).not.toMatch(/hrawdog/iu);
  });

  test("conforms every declared read to the current bundled adapter contract through contracts check", () => {
    const manifest = parseCollectionManifest(readSourceManifest());
    const check = checkAgainstBundledCatalog(manifest);
    expect(check.ok).toBeTrue();
    expect(check.plan).toEqual({ collectionKey: "hraness-social-profile-statistics", reads: 15 });
    const reads = manifest.accounts.flatMap((account) => account.reads);
    for (const [index, read] of reads.entries()) {
      const verdict = check.reads[index];
      expect(verdict?.verdict).toBe("ok");
      if (verdict?.verdict !== "ok") continue;
      expect(verdict.binding.transport).toBe("web-session-api");
      expect(read.adapter).toBe(`${read.expectedOutput.provider}-web`);
      const publicAccess = currentPublicOperationCoordinates.has(
        `${read.expectedOutput.provider}/${read.operation}`,
      );
      expect(verdict.binding.authority).toBe(publicAccess ? "public" : "auth");
      expect(read.authority.kind).toBe(verdict.binding.authority);
    }
  });

  test("rejects duplicate account keys and malformed extra fields", () => {
    const duplicate = mutableManifest();
    const duplicateAccounts = duplicate.accounts as Record<string, unknown>[];
    duplicateAccounts.push(structuredClone(duplicateAccounts[0]!));
    expect(() => parseCollectionManifest(duplicate)).toThrow("repeats an account key");

    const extra = mutableManifest();
    firstRead(extra).rawResponse = true;
    expect(() => parseCollectionManifest(extra)).toThrow("has an unsupported key rawResponse");
  });

  test("rejects non-R1 and mutating semantics and reports a capture-required requirement as a gap", () => {
    for (const [field, value] of [
      ["risk", "R2"],
      ["sideEffect", "changes remote state"],
    ] as const) {
      const candidate = mutableManifest();
      const semantics = firstRead(candidate).semantics as Record<string, unknown>;
      semantics[field] = value;
      expect(() => parseCollectionManifest(candidate)).toThrow(`semantics.${field} must equal`);
    }
    const captureRequired = mutableManifest();
    (firstRead(captureRequired).semantics as Record<string, unknown>).state = "capture-required";
    const check = checkAgainstBundledCatalog(parseCollectionManifest(captureRequired));
    expect(check.ok).toBeFalse();
    expect(check.reads[0]).toMatchObject({
      verdict: "gap",
      gap: { reason: "state-mismatch", detail: "installed state is observed; plan requires capture-required" },
    });
  });

  test("rejects missing and uninstalled adapters or operations", () => {
    for (const field of ["adapter", "operation"] as const) {
      const missing = mutableManifest();
      delete firstRead(missing)[field];
      expect(() => parseCollectionManifest(missing)).toThrow(`is missing required key ${field}`);
    }

    const badAdapter = mutableManifest();
    firstRead(badAdapter).adapter = "missing-web";
    expect(checkAgainstBundledCatalog(parseCollectionManifest(badAdapter)).reads[0]).toMatchObject({
      verdict: "gap",
      gap: { reason: "adapter-missing" },
    });

    const badOperation = mutableManifest();
    firstRead(badOperation).operation = "missing.read";
    expect(checkAgainstBundledCatalog(parseCollectionManifest(badOperation)).reads[0]).toMatchObject({
      verdict: "gap",
      gap: { reason: "operation-missing" },
    });

    const badAuthority = mutableManifest();
    firstRead(badAuthority).authority = { kind: "public" };
    expect(checkAgainstBundledCatalog(parseCollectionManifest(badAuthority)).reads[0]).toMatchObject({
      verdict: "gap",
      gap: { reason: "authority-mismatch", detail: "installed authority is auth; plan requires public" },
    });
  });

  test("keeps the prose and package boundary aligned with the authoritative JSON", () => {
    const manifest = parseCollectionManifest(readSourceManifest());
    const byKey = new Map(manifest.accounts.map((account) => [account.accountKey, account]));
    const aichartsIo = byKey.get("x-aichartsio")?.reads[0];
    const linkedInCompany = byKey.get("linkedin-company-hraness")?.reads[0];
    const threads = byKey.get("threads-hraness")?.reads[0];
    const reference = readFileSync(referencePath, "utf8");
    expect(reference).toContain("[Hraness social-profile manifest](hraness-social-profile-stats.json)");
    expect(reference).toContain("ghostget contracts check --plan");
    expect(reference).toContain(`\`${byKey.get("x-aichartsio")?.accountKey}\``);
    expect(reference).toContain(`second exact handle is \`${String(aichartsIo?.input.handle)}\``);
    expect(reference).toContain(
      `${String((linkedInCompany?.requiredDelayBeforeMs ?? 0) / 1_000)}-second idle interval`,
    );
    expect(reference).toContain(
      `Threads \`${threads?.expectedCategoricalGaps[0]?.metricKey}\``,
    );
    expect(reference).toContain(
      `\`${threads?.expectedCategoricalGaps[0]?.reason}\``,
    );
    expect(reference).toContain("until the account becomes\neligible");
    expect(reference).not.toMatch(/hrawdog/iu);
    expect(existsSync(manifestPath)).toBeTrue();

    const packageManifest = record(
      JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as unknown,
      "package.json",
    );
    expect(packageManifest.files).toBeArray();
    expect(packageManifest.files as unknown[]).toContain("skills");
    expect(packageManifest.files as unknown[]).toContain("src/providers/read-failure.ts");
    expect(packageManifest.files as unknown[]).toContain("src/contracts.ts");
  });
});
