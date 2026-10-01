import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fc from "fast-check";
import { assertProperty } from "../src/test-support";

import {
  ANALYTICS_ROUTE_META,
  ATTRIBUTION_PARAMETERS,
  CUSTOM_EVENTS,
  ExceptionBudget,
  LEGACY_SITE_IDS,
  SCHEMA_VERSION,
  SITE_ID,
  captureCta,
  captureInstallCommandCopied,
  captureOutboundLink,
  createBrowserConfig,
  createExceptionReporter,
  doNotTrackEnabled,
  resolveRoute,
  sanitizeCapture,
  sanitizeError,
  type BrowserEvidence,
} from "./source/analytics-contract";
import { PUBLIC_PAGES } from "./build";

const websiteRoot = import.meta.dir;

test("search-referrer queries never survive in SDK keyword properties", async () => {
  const query = "wire-private-search-canary";
  const keywords = Object.fromEntries([
    "ph_keyword", "$initial_ph_keyword", "$session_entry_ph_keyword", "$prev_pageview_ph_keyword", "$INITIAL_PH_KEYWORD",
  ].map((key) => [key, query]));
  const evidence = evidenceFor("/docs/", "https://ghostget.com/docs/");
  const sanitized = sanitizeCapture({ event: "$pageview", properties: {
    token, $current_url: evidence.href, $referrer: `https://www.google.com/search?q=${query}`,
    $search_engine: "google", ...keywords, diagnostic: { ...keywords, safe: 42 },
  } }, evidence);
  expect(sanitized?.properties).toMatchObject({
    $referrer: "https://www.google.com", $search_engine: "google", traffic_channel: "organic_search", traffic_source: "google", diagnostic: { safe: 42 },
  });
  expect(JSON.stringify(sanitized)).not.toContain(query);
  const sdk = await runHarness(evidence.href, `https://www.google.com/search?q=${query}`, "/docs/");
  expect(sdk.received.some((capture) => capture.properties.ph_keyword === query)).toBe(true);
  expect(JSON.stringify(sdk.returned)).not.toContain(query);
});

const token = "phc_public_project_token";
const home: BrowserEvidence = {
  href: "https://ghostget.com/?utm_source=news#fragment",
  referrer: "https://chatgpt.com/private/thread?token=private",
  route: "/",
};

function evidenceFor(route: string | null, href = `https://ghostget.com${route ?? "/missing/"}`): BrowserEvidence {
  return { href, referrer: "", route };
}

function recorder() {
  const captures: unknown[][] = [];
  return {
    captures,
    target: { capture: (...args: unknown[]) => { captures.push(args); } },
  };
}

type HarnessResult = Readonly<{
  bodies: unknown[];
  received: Array<{ event: string; properties: Record<string, unknown> }>;
  returned: Array<{ event: string; properties: Record<string, unknown> } | null>;
}>;

async function runHarness(href: string, referrer: string, route: string, properties: Record<string, unknown> = {}): Promise<HarnessResult> {
  const child = Bun.spawn(["bun", join(websiteRoot, "analytics-posthog-harness.ts")], {
    env: { ...process.env, HARNESS_HREF: href, HARNESS_REFERRER: referrer, HARNESS_ROUTE: route, HARNESS_PROPERTIES: JSON.stringify(properties) },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`analytics harness exited ${exitCode}: ${stderr}`);
  return JSON.parse(stdout) as HarnessResult;
}

describe("ghostget.com analytics contract", () => {
  test("reports the ghostget site id and schema version 2", () => {
    expect(SITE_ID).toBe("ghostget");
    expect(LEGACY_SITE_IDS).toEqual(["wrench"]);
    expect(SCHEMA_VERSION).toBe(2);
    const capture = sanitizeCapture({ event: "$pageview", properties: { $current_url: home.href, token } }, home);
    expect(capture?.properties).toMatchObject({ analytics_schema_version: 2, site_id: "ghostget" });
  });

  test("selects the EU UI only for the exact validated ingestion origin", () => {
    expect(createBrowserConfig("https://eu.i.posthog.com", home).ui_host).toBe("https://eu.posthog.com");
    for (const host of [
      "https://us.i.posthog.com",
      "https://eu.i.posthog.com.attacker.example",
      "https://attacker.example/eu.i.posthog.com",
      "https://attacker.example/?host=eu.i.posthog.com",
    ]) {
      expect(createBrowserConfig(host, home).ui_host).toBe("https://us.posthog.com");
    }
  });

  test("keeps the cookieless, personless, bundled-SDK configuration", () => {
    const config = createBrowserConfig("https://us.i.posthog.com", home);
    expect(config).toMatchObject({
      autocapture: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      capture_pageleave: true,
      capture_pageview: true,
      capture_performance: { network_timing: false, web_vitals: true },
      cookieless_mode: "always",
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      disable_surveys: true,
      mask_personal_data_properties: false,
      persistence: "memory",
      person_profiles: "never",
      respect_dnt: true,
    });
  });

  test("the consent gate blocks captures again after withdrawal without changing privacy filters", () => {
    let allowed = false;
    const config = createBrowserConfig("https://us.i.posthog.com", home, () => allowed);
    const beforeSend = config.before_send as (capture: unknown) => { properties: Record<string, unknown> } | null;
    const capture = { event: "$pageview", properties: { $current_url: home.href, token, email: "private@example.com" } };
    expect(beforeSend(capture)).toBeNull();
    allowed = true;
    expect(beforeSend(capture)?.properties).toMatchObject({ site_id: "ghostget" });
    expect(beforeSend(capture)?.properties).not.toHaveProperty("email");
    allowed = false;
    expect(beforeSend(capture)).toBeNull();
    expect(config.request_batching).toBe(false);
  });

  test("every built public page reports its own route, never not-found", async () => {
    for (const page of PUBLIC_PAGES) {
      const route = resolveRoute(`https://ghostget.com${page.canonicalPath}?gclid=x`, evidenceFor(page.canonicalPath));
      expect({ path: page.canonicalPath, kind: route?.pageKind }).not.toEqual({ path: page.canonicalPath, kind: "not_found" });
      expect(route?.canonicalPath).toBe(page.canonicalPath);
    }
    // Pages whose v1 page_kind existed keep it so per-page history lines up.
    for (const [path, pageKind] of [
      ["/", "product_landing"],
      ["/docs/", "docs_index"],
      ["/docs/how-to/connect-beeper/", "provider_beeper"],
      ["/compare/browser-use/", "compare_browser_use"],
      ["/vms-cannot-contain-agents/", "vms_cannot_contain_agents"],
    ] as const) {
      expect(resolveRoute(`https://ghostget.com${path}`, evidenceFor(path))?.pageKind).toBe(pageKind);
    }
    expect(resolveRoute("https://ghostget.com/blog/introducing-ghostget/", evidenceFor("/blog/introducing-ghostget/"))).toMatchObject({
      contentGroup: "blog",
      contentSlug: "introducing-ghostget",
      pageKind: "article",
    });
  });

  test("the build writes each page's route and an empty route on the 404 page", async () => {
    const pages = await Promise.all(PUBLIC_PAGES.slice(0, 40).map(async (page) => ({
      html: await readFile(join(websiteRoot, "dist", page.outputFile), "utf8").catch(() => null),
      page,
    })));
    const built = pages.filter((entry) => entry.html !== null);
    for (const { html, page } of built) {
      expect(html).toContain(`<meta name="${ANALYTICS_ROUTE_META}" content="${page.canonicalPath}">`);
    }
    const notFound = await readFile(join(websiteRoot, "dist/404.html"), "utf8").catch(() => null);
    if (notFound !== null) expect(notFound).toContain(`<meta name="${ANALYTICS_ROUTE_META}" content="">`);
  });

  test("a 404 render collapses to /not-found and records the bounded requested path", () => {
    const evidence = evidenceFor(null, "https://ghostget.com/missing/page?email=a@b.co");
    const pageview = sanitizeCapture({
      event: "$pageview",
      properties: { $current_url: evidence.href, $referrer: "https://news.example.org/a/b?c=d", token },
    }, evidence);
    expect(pageview?.properties).toMatchObject({
      $current_url: "https://ghostget.com/not-found",
      $pathname: "/not-found",
      canonical_path: "/not-found",
      page_kind: "not_found",
    });
    const notFound = sanitizeCapture({
      event: "page not found",
      properties: { $current_url: evidence.href, $referrer: "https://news.example.org/a/b?c=d", token },
    }, evidence);
    expect(notFound?.properties).toMatchObject({
      referrer_host: "news.example.org",
      requested_path: "/missing/page",
    });
    // A real page never emits a not-found event.
    expect(sanitizeCapture({ event: "page not found", properties: { $current_url: home.href, token } }, home)).toBeNull();
  });

  test("keeps attribution parameters and drops every other query value and the fragment", () => {
    const capture = sanitizeCapture({
      event: "$pageview",
      properties: {
        $current_url: "https://ghostget.com/?utm_source=news&gclid=abc&email=reader%40example.com&code=secret&ref=me#frag",
        $initial_utm_campaign: "launch",
        $referrer: "https://chatgpt.com/c/private?secret=value",
        gclid: "abc",
        nested: { email: "reader@example.com" },
        token,
        utm_source: "news",
      },
    }, home);
    expect(capture?.properties).toMatchObject({
      $current_url: "https://ghostget.com/?utm_source=news&gclid=abc",
      $initial_utm_campaign: "launch",
      $referrer: "https://chatgpt.com",
      gclid: "abc",
      referrer_host: "chatgpt.com",
      traffic_channel: "ai_referral",
      utm_source: "news",
    });
    expect(JSON.stringify(capture)).not.toContain("reader@example.com");
    expect(JSON.stringify(capture)).not.toContain("secret");
    expect(ATTRIBUTION_PARAMETERS.has("ref")).toBe(false);
  });

  test("drops private data in property names at the root and inside objects and arrays", () => {
    for (const key of [
      "0@-.AA",
      "reader@example.com",
      "reader%40example.com",
      "phx_private_key",
      "Bearer private_access_token",
      "https://example.com/path?code=private_value",
      "/path?token=private_value",
    ]) {
      const capture = sanitizeCapture({
        event: "$pageview",
        properties: {
          [key]: "present",
          $current_url: home.href,
          $lib: "posthog-js",
          token,
          utm_source: "news",
          safe_metric: 1,
          diagnostic: { [key]: "present", safe_metric: 2, items: [{ [key]: "present", safe_metric: 3 }] },
        },
      }, home);
      expect(capture).not.toBeNull();
      expect(Object.hasOwn(capture!.properties, key)).toBe(false);
      expect(capture!.properties.diagnostic).toEqual({ safe_metric: 2, items: [{ safe_metric: 3 }] });
      expect(capture!.properties).toMatchObject({ $lib: "posthog-js", token, utm_source: "news", safe_metric: 1 });
    }
  });

  test("drops foreign, preview, and local hosts", () => {
    for (const href of ["https://preview.example.com/", "https://ghostget-git-x.vercel.app/", "http://localhost:3000/"]) {
      expect(sanitizeCapture({ event: "$pageview", properties: { $current_url: href, token } }, evidenceFor("/", href))).toBeNull();
    }
  });

  test("admits only the documented events with their exact property shapes", () => {
    for (const event of ["$autocapture", "$rageclick", "$identify", "project link opened", "custom"]) {
      expect(sanitizeCapture({ event, properties: { $current_url: home.href, token } }, home)).toBeNull();
    }
    for (const event of CUSTOM_EVENTS) expect(event).toMatch(/^[a-z]+(?: [a-z]+){1,3}$/u);
    expect(sanitizeCapture({
      event: "cta clicked",
      properties: { $current_url: home.href, cta: "hero-install", placement: "hero", token },
    }, home)).not.toBeNull();
    expect(sanitizeCapture({
      event: "cta clicked",
      properties: { $current_url: home.href, cta: "Install now!", placement: "hero", token },
    }, home)).toBeNull();
  });

  test("interaction helpers emit the v2 vocabulary", () => {
    const { captures, target } = recorder();
    captureCta(target, "hero-install");
    captureCta(target, "unknown");
    captureInstallCommandCopied(target, "cli", "hero");
    captureInstallCommandCopied(target, "agent_skill", "docs");
    captureInstallCommandCopied(target, "rm -rf", "hero");
    captureOutboundLink(target, "https://github.com/hraness/ghostget", "nav");
    captureOutboundLink(target, "https://x.com/hraness", "footer");
    captureOutboundLink(target, "https://ghostget.com/docs/", "nav");
    captureOutboundLink(target, "mailto:hi@example.com", "footer");
    expect(captures).toEqual([
      ["cta clicked", { cta: "hero-install", placement: "hero" }, { send_instantly: true, transport: "sendBeacon" }],
      ["install command copied", { install_method: "bun", placement: "hero" }],
      ["install command copied", { install_method: "npm", placement: "docs" }],
      ["outbound link opened", { link_kind: "github", placement: "nav", target_host: "github.com" }, { send_instantly: true, transport: "sendBeacon" }],
      ["outbound link opened", { link_kind: "social", placement: "footer", target_host: "x.com" }, { send_instantly: true, transport: "sendBeacon" }],
    ]);
  });

  test("exceptions are scrubbed, fingerprinted, and budgeted", () => {
    const calls: unknown[][] = [];
    const report = createExceptionReporter(
      { captureException: (...args: unknown[]) => { calls.push(args); } },
      new ExceptionBudget({ perFingerprintLimit: 2, totalLimit: 3, windowMs: 60_000 }),
    );
    const leaky = new Error("failed for reader@example.com at https://ghostget.com/docs/?code=abc");
    expect(report(leaky, "window_error")).toBe(true);
    expect(report(leaky, "window_error")).toBe(false);
    expect(report(new Error("failed for reader@example.com at https://ghostget.com/docs/?code=abc"), "window_error")).toBe(true);
    expect(report(new Error("same fingerprint again? no, same text"), "unhandled_rejection")).toBe(true);
    expect(report(new Error("over the total budget"), "window_error")).toBe(false);
    const [error, properties] = calls[0] as [Error, Record<string, unknown>];
    expect(error.message).not.toContain("reader@example.com");
    expect(error.message).not.toContain("code=abc");
    expect(properties).toMatchObject({ error_origin: "window_error", error_surface: "client" });
    expect(properties.error_fingerprint).toMatch(/^e_[0-9a-f]{8}$/u);
    expect(sanitizeError("plain rejection").message).toBe("plain rejection");
  });

  test("Do Not Track stops the bootstrap because cookieless mode ignores respect_dnt", () => {
    for (const value of ["1", "yes", "true"]) {
      expect(doNotTrackEnabled({ doNotTrack: value }, {})).toBe(true);
      expect(doNotTrackEnabled({}, { doNotTrack: value })).toBe(true);
    }
    expect(doNotTrackEnabled({ doNotTrack: "0" }, { doNotTrack: null })).toBe(false);
    expect(doNotTrackEnabled(undefined, undefined)).toBe(false);
  });

  test("sanitized output never carries an email or a phc token outside the token property", () => {
    assertProperty(fc.property(
      fc.dictionary(fc.string({ maxLength: 12 }), fc.oneof(fc.string(), fc.emailAddress(), fc.constant("phx_secretvalue"))),
      (extra) => {
        const capture = sanitizeCapture({
          event: "$pageview",
          properties: { ...extra, $current_url: home.href, token },
        }, home);
        if (capture === null) return;
        const { token: kept, ...rest } = capture.properties;
        expect(kept).toBe(token);
        const text = JSON.stringify(rest);
        expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u);
        expect(text).not.toContain("phx_secretvalue");
      },
    ));
  });
});

describe("ghostget.com analytics through the pinned posthog-js", () => {
  test("drops sensitive property names at every depth through the production SDK", async () => {
    const privateFields = { email: "plain", code: "oauth-code", state: "opaque", access_token: "secret", _kx: "id", ref: "person" };
    const result = await runHarness("https://ghostget.com/", "", "/", {
      ...privateFields, $initial_email: "plain", $session_entry_access_token: "secret",
      nested: { ...privateFields, token: "phx_secretvalue", valid: "kept" },
    });
    const properties = result.returned[0]!.properties;
    for (const key of [...Object.keys(privateFields), "$initial_email", "$session_entry_access_token"]) expect(properties).not.toHaveProperty(key);
    expect(properties.nested).toEqual({ valid: "kept" });
    expect(properties.token).toBe("phc_harnesstoken");
  });

  test("collapses sensitive requested and historical paths and strips their attribution", async () => {
    for (const path of ["/auth/private-token", "/account/customer", "/billing/customer", "/checkout/private", "/invite/private"]) {
      const result = await runHarness(`https://ghostget.com${path}?utm_source=private&gclid=secret`, "", "");
      expect(result.returned[0]!.properties).toMatchObject({ $current_url: "https://ghostget.com/private", canonical_path: "/private" });
      expect(result.returned[3]!.properties.requested_path).toBe("/private");
      expect(JSON.stringify(result.bodies)).not.toContain("private-token");
      expect(result.returned[0]!.properties).not.toHaveProperty("utm_source");
      expect(result.returned[0]!.properties).not.toHaveProperty("gclid");
    }
    const result = await runHarness("https://ghostget.com/docs/?utm_source=public", "", "/docs/", {
      $initial_current_url: "https://ghostget.com/invite/private-token?utm_source=private",
      $session_entry_url: "https://ghostget.com/auth/private-token?gclid=secret",
      $initial_utm_source: "private", $session_entry_gclid: "secret",
    });
    const properties = result.returned[0]!.properties;
    expect(properties.$initial_current_url).toBe("https://ghostget.com/private");
    expect(properties.$session_entry_url).toBe("https://ghostget.com/private");
    for (const key of ["utm_source", "$initial_utm_source", "$session_entry_gclid"]) expect(properties).not.toHaveProperty(key);
  });

  test("before_send keeps the portfolio properties posthog-js emits and scrubs the rest", async () => {
    const result = await runHarness(
      "https://ghostget.com/docs/?utm_source=news&gclid=abc&email=reader%40example.com&code=secret#frag",
      "https://news.example.org/some/path?x=1",
      "/docs/",
    );
    expect(result.received.map((capture) => capture.event)).toEqual([
      "$pageview", "$pageleave", "outbound link opened", "page not found", "$autocapture", "$exception",
    ]);
    expect(result.returned.map((capture) => capture?.event ?? null)).toEqual([
      "$pageview", "$pageleave", "outbound link opened", null, null, "$exception",
    ]);
    const pageview = result.returned[0]!;
    expect(pageview.properties).toMatchObject({
      $current_url: "https://ghostget.com/docs/?utm_source=news&gclid=abc",
      $host: "ghostget.com",
      $pathname: "/docs/",
      $referrer: "https://news.example.org",
      analytics_schema_version: 2,
      canonical_path: "/docs/",
      gclid: "abc",
      page_kind: "docs_index",
      site_id: "ghostget",
      token: "phc_harnesstoken",
      utm_source: "news",
    });
    for (const key of ["$raw_user_agent", "$referring_domain", "$cookieless_mode", "$lib_version"]) {
      expect(pageview.properties).toHaveProperty(key);
    }
    // Cookieless mode leaves session and window IDs to PostHog's ingestion.
    expect(result.returned[0]).toHaveProperty("properties.$cookieless_mode", true);
    const exception = result.returned[5]!;
    expect(exception.properties).toMatchObject({ error_origin: "window_error", error_surface: "client" });
    expect(JSON.stringify(result.returned)).not.toContain("reader@example.com");
    expect(JSON.stringify(result.bodies)).not.toContain("reader%40example.com");
    expect(result.bodies.length).toBeGreaterThanOrEqual(4);
  });

  test("a 404 render sends a not-found pageview and a page not found event", async () => {
    const result = await runHarness("https://ghostget.com/nope/?utm_source=x", "https://ghostget.com/docs/", "");
    const notFound = result.returned[3]!;
    expect(notFound).toMatchObject({
      event: "page not found",
      properties: { page_kind: "not_found", requested_path: "/nope" },
    });
    expect(result.returned[0]?.properties).toMatchObject({ $pathname: "/not-found", canonical_path: "/not-found" });
  });
});
