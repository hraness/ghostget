import { describe, expect, test } from "bun:test";

import {
  createProductionReleaseMarker,
  parseProductionReleaseMarker,
  PRODUCTION_RELEASE_MARKER_MAX_BYTES,
  PRODUCTION_RELEASE_MARKER_PATH,
  PRODUCTION_RELEASE_MARKER_SCHEMA,
  serializeProductionReleaseMarker,
} from "./production-release-marker.mjs";

const sourceSha = "2".repeat(40);
const deploymentUrl = "https://ghostget-release123-hraness.vercel.app";
const marker = createProductionReleaseMarker({
  deploymentUrl,
  name: "@hraness/ghostget",
  sourceSha,
  tag: "v0.17.0",
  version: "0.17.0",
});
const canonical = `{"schemaVersion":"wrench-production-release-v1","name":"@hraness/ghostget","repository":"hraness/ghostget","tag":"v0.17.0","version":"0.17.0","sourceSha":"${sourceSha}","deploymentUrl":"${deploymentUrl}"}\n`;

describe("production release marker", () => {
  test("accepts exact legacy baseline bytes without accepting mixed brand or deployment identities", () => {
    const legacy = { ...marker, name: "@hraness/wrench", repository: "hraness/wrench", tag: "v0.16.16", version: "0.16.16", deploymentUrl: "https://wrench-release123-hraness.vercel.app" };
    const body = `${JSON.stringify(legacy)}\n`;
    expect(parseProductionReleaseMarker(body)).toEqual(legacy);
    expect(serializeProductionReleaseMarker(legacy)).toBe(body);
    for (const change of [{ name: "@hraness/ghostget" }, { repository: "hraness/ghostget" }, { deploymentUrl }, { tag: "v0.17.0", version: "0.17.0" }]) {
      expect(() => parseProductionReleaseMarker(`${JSON.stringify({ ...legacy, ...change })}\n`)).toThrow();
    }
  });
  test("keeps one exact bounded canonical seven-key wire contract", () => {
    expect(PRODUCTION_RELEASE_MARKER_PATH).toBe("/.well-known/wrench-release.json");
    expect(PRODUCTION_RELEASE_MARKER_SCHEMA).toBe("wrench-production-release-v1");
    expect(PRODUCTION_RELEASE_MARKER_MAX_BYTES).toBe(1_024);
    expect(Object.keys(marker)).toEqual([
      "schemaVersion",
      "name",
      "repository",
      "tag",
      "version",
      "sourceSha",
      "deploymentUrl",
    ]);
    expect(serializeProductionReleaseMarker(marker)).toBe(canonical);
    expect(new TextEncoder().encode(canonical).byteLength)
      .toBeLessThanOrEqual(PRODUCTION_RELEASE_MARKER_MAX_BYTES);
    expect(parseProductionReleaseMarker(canonical)).toEqual(marker);
    expect(Object.isFrozen(marker)).toBe(true);
  });

  test("rejects malformed, reordered, expanded, or noncanonical marker bodies", () => {
    const value = JSON.parse(canonical) as Record<string, unknown>;
    const reordered = {
      name: value.name,
      schemaVersion: value.schemaVersion,
      repository: value.repository,
      tag: value.tag,
      version: value.version,
      sourceSha: value.sourceSha,
      deploymentUrl: value.deploymentUrl,
    };
    for (const body of [
      canonical.slice(0, -1),
      `${canonical}\n`,
      `${JSON.stringify(value, null, 2)}\n`,
      `${JSON.stringify(reordered)}\n`,
      `${JSON.stringify({ ...value, extra: true })}\n`,
      "null\n",
      "[]\n",
      "not json\n",
      "x".repeat(PRODUCTION_RELEASE_MARKER_MAX_BYTES + 1),
    ]) {
      expect(() => parseProductionReleaseMarker(body)).toThrow();
    }
    expect(() => parseProductionReleaseMarker(1 as unknown as string)).toThrow(
      "body must be a string",
    );
  });

  test("rejects every release-identity and deployment-identity drift", () => {
    const cases = [
      { schemaVersion: "ghostget-production-release-v2" },
      { schemaVersion: 1 },
      { name: "ghostget" },
      { repository: "other/ghostget" },
      { tag: "0.17.0" },
      { tag: "v0.17.0-beta.1" },
      { version: "0.16.16" },
      { version: "00.17.0" },
      { sourceSha: "A".repeat(40) },
      { sourceSha: "2".repeat(39) },
      { deploymentUrl: "http://ghostget-release123-hraness.vercel.app" },
      { deploymentUrl: "https://ghostget-release123-hraness.vercel.app/" },
      { deploymentUrl: "https://ghostget-release_123-hraness.vercel.app" },
      { deploymentUrl: "https://ghostget-five.vercel.app" },
      { deploymentUrl: "https://ghostget.com" },
    ] as const;
    for (const override of cases) {
      expect(() => parseProductionReleaseMarker(
        `${JSON.stringify({ ...marker, ...override })}\n`,
      )).toThrow();
    }
  });
});
