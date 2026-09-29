/**
 * The one typed place for every number in the GhostGet launch post, the
 * social kit, and the launch film captions.
 *
 * Each value names where it came from. `facts.test.ts` checks the values
 * against those sources (the homepage measurement table, the provider
 * capability attestation, the claims register, and the root package.json),
 * so a release that changes one fails the test instead of shipping a stale
 * number.
 */
import type { LaunchFacts, LaunchStatus } from "@hraness/design-kit/launch";
import packageJson from "../../package.json" with { type: "json" };

/** The measurement date in the homepage "Measured" table. */
export const LAUNCH_MEASURED_ON = "September 22, 2026" as const;

/** Byte counts from the homepage "Measured" table, read over HTTP without a browser. */
export const LAUNCH_MEASURED_READS = Object.freeze([
  { page: "Wikipedia article", markdownBytes: 15_021, htmlBytes: 145_617 },
  { page: "GitHub repository page", markdownBytes: 79_955, htmlBytes: 647_690 },
  { page: "Hacker News front page", markdownBytes: 7_311, htmlBytes: 34_791 },
  { page: "example.com", markdownBytes: 345, htmlBytes: 559 },
] as const);

/** Services with at least one callable action in this release; the build derives the same count. */
export const LAUNCH_SERVICE_COUNT = 21 as const;

/** Claims in verification/claims.json that name no automated check. */
export const LAUNCH_CLAIMS_NOT_VERIFIED = 19 as const;

function bytes(value: number): string {
  return `${value.toLocaleString("en-US")} bytes`;
}

function ratio(markdown: number, html: number): string {
  return `${(html / markdown).toFixed(1)} times`;
}

const wikipedia = LAUNCH_MEASURED_READS[0];

/** The released version, as `v<semver>`. */
export const LAUNCH_RELEASE_VERSION = `v${packageJson.version}` as const;

/** The release record: the status label comes from the root package.json version. */
export const LAUNCH_RELEASE = Object.freeze({
  status: `Latest release: ${LAUNCH_RELEASE_VERSION}` as LaunchStatus,
  /** A public GitHub Release with a one-command install exists for every tagged version. */
  publicInstall: true,
  tags: Object.freeze(["Developer Tools", "Artificial Intelligence", "Open Source"]),
});

export const LAUNCH_CANONICAL_URL = "https://ghostget.com/blog/introducing-ghostget/" as const;

export const launchFacts = Object.freeze({
  wikiMarkdownBytes: { value: bytes(wikipedia.markdownBytes), source: "website/source/index.html, Measured table" },
  wikiHtmlBytes: { value: bytes(wikipedia.htmlBytes), source: "website/source/index.html, Measured table" },
  wikiRatio: { value: ratio(wikipedia.markdownBytes, wikipedia.htmlBytes), source: "Computed from the Measured table" },
  measuredOn: { value: LAUNCH_MEASURED_ON, source: "website/source/index.html, Measured table summary" },
  serviceCount: { value: String(LAUNCH_SERVICE_COUNT), source: "website/provider-presentation.ts createProviderDirectory().providerCount" },
  claimsNotVerified: { value: String(LAUNCH_CLAIMS_NOT_VERIFIED), source: "verification/claims.json, status not-verified" },
  status: { value: LAUNCH_RELEASE.status, source: "package.json version" },
} satisfies LaunchFacts);

export type LaunchFactKey = keyof typeof launchFacts;
