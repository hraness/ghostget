/**
 * Pins the launch facts to their records and checks the kit's structural
 * rules. Tests check facts and structure, not prose.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolvedLaunchBeats } from "./beats.ts";
import { LAUNCH_FILM } from "./film.ts";
import { LAUNCH_CLAIMS_NOT_VERIFIED, LAUNCH_MEASURED_READS, LAUNCH_RELEASE_VERSION, LAUNCH_SERVICE_COUNT } from "./facts.ts";
import { LAUNCH_MOCKUP_IDS } from "./mockups.tsx";
import { launchServicesFrom, renderLaunchBeatsHtml, renderLaunchMockupSlots } from "./render.tsx";
import { launchMessaging, renderSocialKitMarkdown, socialKit } from "./social-kit.ts";

const repositoryRoot = join(import.meta.dir, "../..");
// The provider modules reach into src/, which the root tsconfig checks without the DOM lib;
// load them untyped here so website/tsconfig.json does not re-check src/ under DOM types.
type ProviderDirectoryShape = { providerCount: number; entries: readonly { name: string; supportedActionCount: number }[] };
const attestationModule: string = "../provider-capability-attestation.ts";
const presentationModule: string = "../provider-presentation.ts";
const { loadProviderCapabilityAttestation } = (await import(attestationModule)) as { loadProviderCapabilityAttestation(root: string): Promise<unknown> };
const { createProviderDirectory } = (await import(presentationModule)) as { createProviderDirectory(attestation: unknown): ProviderDirectoryShape };
const directory = createProviderDirectory(await loadProviderCapabilityAttestation(repositoryRoot));
const services = launchServicesFrom(directory.entries);

describe("launch facts", () => {
  test("service count equals the provider directory", () => {
    expect(directory.providerCount).toBe(LAUNCH_SERVICE_COUNT);
  });

  test("not-verified claim count equals the claims register", async () => {
    const register = JSON.parse(await readFile(join(repositoryRoot, "verification/claims.json"), "utf8")) as { claims: { status: string }[] };
    expect(register.claims.filter((claim) => claim.status === "not-verified").length).toBe(LAUNCH_CLAIMS_NOT_VERIFIED);
  });

  test("measured reads match the homepage table", async () => {
    const home = await readFile(join(repositoryRoot, "website/source/index.html"), "utf8");
    for (const read of LAUNCH_MEASURED_READS) {
      expect(home).toContain(`${read.markdownBytes.toLocaleString("en-US")} bytes`);
      expect(home).toContain(`${read.htmlBytes.toLocaleString("en-US")} bytes`);
    }
  });

  test("release version comes from package.json", async () => {
    const pkg = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as { version: string };
    expect(LAUNCH_RELEASE_VERSION).toBe(`v${pkg.version}`);
  });

  test("launch meta description equals the site description", async () => {
    const build = await readFile(join(repositoryRoot, "website/build.ts"), "utf8");
    expect(build).toContain(`export const SITE_DESCRIPTION =\n  ${JSON.stringify(launchMessaging.meta)} as const;`);
  });
});

describe("launch beats and mockups", () => {
  test("every beat uses a known mockup", () => {
    for (const beat of resolvedLaunchBeats) {
      expect(beat.visual.kind).toBe("mockup");
      if (beat.visual.kind === "mockup") expect(LAUNCH_MOCKUP_IDS as readonly string[]).toContain(beat.visual.id);
    }
  });

  test("every mockup is labelled as an illustration and renders without script", () => {
    const html = renderLaunchBeatsHtml(services);
    expect(html).not.toContain("<script");
    const figures = html.match(/data-figure-kind="illustration"/gu) ?? [];
    expect(figures.length).toBe(resolvedLaunchBeats.length);
  });

  test("the services mockup lists every service with an action", () => {
    const html = renderLaunchMockupSlots("{{LAUNCH_MOCKUP:services}}", services);
    for (const service of services) expect(html).toContain(service.name);
  });

  test("an unknown mockup slot throws", () => {
    expect(() => renderLaunchMockupSlots("{{LAUNCH_MOCKUP:nope}}", services)).toThrow();
  });

  test("the homepage and post only use known mockup slots", async () => {
    for (const file of ["website/source/index.html", "website/source/blog/introducing-ghostget.html"]) {
      const source = await readFile(join(repositoryRoot, file), "utf8");
      for (const [, id] of source.matchAll(/\{\{LAUNCH_MOCKUP:([a-z-]+)/gu)) expect(LAUNCH_MOCKUP_IDS as readonly (string | undefined)[]).toContain(id);
    }
  });
});

describe("social kit", () => {
  test("one post per beat on each thread platform, within limits", () => {
    for (const [posts, limit] of [[socialKit.x, 280], [socialKit.bluesky, 300], [socialKit.threads, 500]] as const) {
      expect(posts.length).toBe(resolvedLaunchBeats.length);
      for (const post of posts) expect([...post].length).toBeLessThanOrEqual(limit);
    }
  });

  test("the committed kit matches the beats", async () => {
    const committed = await readFile(join(repositoryRoot, "kb/launch/social-kit.md"), "utf8");
    expect(committed).toBe(renderSocialKitMarkdown());
  });

  test("no Mastodon", () => {
    expect(renderSocialKitMarkdown().toLowerCase()).not.toContain("mastodon");
  });
});

describe("launch film", () => {
  test("every file the film record names is on disk", () => {
    if (LAUNCH_FILM === null) return;
    const publicRoot = join(repositoryRoot, "website/public");
    for (const path of [LAUNCH_FILM.poster, LAUNCH_FILM.captions, ...LAUNCH_FILM.sources.map((source) => source.src)]) {
      expect(existsSync(join(publicRoot, path))).toBe(true);
    }
  });
});

describe("launch renderer seam", () => {
  test("render.tsx satisfies the LaunchRenderer shape build.ts loads", async () => {
    const renderer = await import("./render.tsx");
    for (const name of ["launchServicesFrom", "renderLaunchMockupSlots", "renderLaunchPostBody"] as const) {
      expect(typeof renderer[name]).toBe("function");
    }
  });
});
