import { describe, expect, test } from "bun:test";

import {
  parseVercelDeploymentEnvironment,
  runVercelWebsiteBuild,
  VERCEL_PRODUCTION_BRANCH,
  WRENCH_VERCEL_BUILD_MARKER,
} from "./vercel-build";

const releaseBoundEnvironment = Object.freeze({
  VERCEL: "1",
  WRENCH_VERCEL_BUILD: WRENCH_VERCEL_BUILD_MARKER,
});
const sourceSha = "2".repeat(40);
const productionEnvironment = Object.freeze({
  ...releaseBoundEnvironment,
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: VERCEL_PRODUCTION_BRANCH,
  VERCEL_GIT_COMMIT_SHA: sourceSha,
  VERCEL_URL: "ghostget-release123-hraness.vercel.app",
});

describe("Vercel website build admission", () => {
  test("builds production directly from the main branch", async () => {
    const calls: string[] = [];
    await runVercelWebsiteBuild(productionEnvironment, {
      build: async () => { calls.push("build"); },
    });
    expect(calls).toEqual(["build"]);
    expect(parseVercelDeploymentEnvironment(productionEnvironment)).toBe("production");
  });

  test("keeps previews and local builds independently buildable", async () => {
    for (const environment of [
      {},
      {
        ...releaseBoundEnvironment,
        VERCEL_ENV: "development",
        VERCEL_GIT_COMMIT_REF: "local-preview",
      },
      {
        ...releaseBoundEnvironment,
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "topic-branch",
      },
    ] as const) {
      const calls: string[] = [];
      await runVercelWebsiteBuild(environment, {
        build: async () => { calls.push("build"); },
      });
      expect(calls).toEqual(["build"]);
    }
    expect(parseVercelDeploymentEnvironment({})).toBe("local");
  });

  test("fails closed for missing, malformed, and inconsistent Vercel state", async () => {
    const cases = [
      [{ WRENCH_VERCEL_BUILD: WRENCH_VERCEL_BUILD_MARKER }, "VERCEL must equal 1"],
      [{ WRENCH_VERCEL_BUILD: undefined }, "WRENCH_VERCEL_BUILD must equal release-bound-v1"],
      [{ VERCEL: "1" }, "WRENCH_VERCEL_BUILD must equal release-bound-v1"],
      [{ VERCEL: undefined }, "WRENCH_VERCEL_BUILD must equal release-bound-v1"],
      [{ VERCEL_URL: "ghostget.example" }, "WRENCH_VERCEL_BUILD must equal release-bound-v1"],
      [{ ...releaseBoundEnvironment }, "Unsupported VERCEL_ENV: missing"],
      [
        { ...releaseBoundEnvironment, VERCEL_ENV: "preview" },
        "VERCEL_GIT_COMMIT_REF must be an exact nonempty Git ref",
      ],
      [
        {
          VERCEL: "1",
          VERCEL_ENV: "preview",
          VERCEL_GIT_COMMIT_REF: "topic-branch",
          WRENCH_VERCEL_BUILD: "release-bound-v2",
        },
        "WRENCH_VERCEL_BUILD must equal release-bound-v1",
      ],
      [
        {
          VERCEL: "true",
          VERCEL_ENV: "preview",
          VERCEL_GIT_COMMIT_REF: "topic-branch",
          WRENCH_VERCEL_BUILD: WRENCH_VERCEL_BUILD_MARKER,
        },
        "VERCEL must equal 1",
      ],
      [
        {
          ...releaseBoundEnvironment,
          VERCEL_ENV: "prodution",
          VERCEL_GIT_COMMIT_REF: VERCEL_PRODUCTION_BRANCH,
        },
        "Unsupported VERCEL_ENV: prodution",
      ],
      [
        {
          ...releaseBoundEnvironment,
          VERCEL_ENV: "production",
          VERCEL_GIT_COMMIT_REF: "topic-branch",
        },
        "Vercel production must build main",
      ],
      [
        {
          ...releaseBoundEnvironment,
          VERCEL_ENV: "preview",
          VERCEL_GIT_COMMIT_REF: VERCEL_PRODUCTION_BRANCH,
        },
        "main must be classified as a production deployment",
      ],
      [
        {
          ...releaseBoundEnvironment,
          VERCEL_ENV: "preview",
          VERCEL_GIT_COMMIT_REF: " main",
        },
        "VERCEL_GIT_COMMIT_REF must be an exact nonempty Git ref",
      ],
    ] as const;
    for (const [environment, expected] of cases) {
      const calls: string[] = [];
      await expect(runVercelWebsiteBuild(environment, {
        build: async () => { calls.push("build"); },
      })).rejects.toThrow(expected);
      expect(calls).toEqual([]);
    }
  });

  test("propagates a production build failure", async () => {
    const calls: string[] = [];
    await expect(runVercelWebsiteBuild(productionEnvironment, {
      build: async () => {
        calls.push("build");
        throw new Error("build failed");
      },
    })).rejects.toThrow("build failed");
    expect(calls).toEqual(["build"]);
  });
});
