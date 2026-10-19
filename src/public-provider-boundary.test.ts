import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPublicProviderBoundary } from "../scripts/public-provider-boundary";
import { isReviewedTemplateProtectedHostname } from "./model";
import { providerPluginRegistry } from "./provider-plugins";

const root = join(import.meta.dir, "..");

test("the public package has no removed provider source, exports, routes, or bundled implementations", () => {
  expect(assertPublicProviderBoundary(root)).toBeGreaterThan(100);
  for (const surface of ["x", "webmcp"]) {
    expect(providerPluginRegistry.resolveRoute("provider-api", surface)).toBeUndefined();
    expect(providerPluginRegistry.resolveSessionRoute(surface)).toBeUndefined();
  }
  for (const hostname of ["x.com", "api.x.com", "twitter.com", "upload.twitter.com", "*.twitter.com"]) {
    expect(isReviewedTemplateProtectedHostname(hostname, providerPluginRegistry)).toBeTrue();
  }
  expect(providerPluginRegistry.list().some(plugin => ["x-official", "x-web", "webmcp"].includes(plugin.id))).toBeFalse();
});

test("package admission rejects private implementations hidden in an otherwise ordinary bundle", () => {
  const work = mkdtempSync(join(tmpdir(), "ghostget-public-boundary-"));
  try {
    mkdirSync(join(work, "dist"));
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(work, "package.json"), JSON.stringify({ ...manifest, files: ["dist"] }));
    writeFileSync(join(work, "dist", "index.js"), 'export const marker = "CreateTweet";\n');
    expect(() => assertPublicProviderBoundary(work)).toThrow("removed private provider implementation");
    writeFileSync(join(work, "dist", "index.js"), 'export const marker = "ordinary-provider";\n');
    expect(assertPublicProviderBoundary(work)).toBe(1);
    mkdirSync(join(work, "dist", "x-web"));
    expect(() => assertPublicProviderBoundary(work)).toThrow("removed private provider path");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
