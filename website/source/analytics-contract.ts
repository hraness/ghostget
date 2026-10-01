// The ghostget.com analytics contract: which events may leave the browser and
// what each one may carry. It follows the portfolio observability standard
// (schema version 2) and mirrors @hraness/posthog v0.2.0 semantics: allowlist
// event names, scrub values without rebuilding the property object, keep
// campaign tags and ad click IDs, and drop everything that could identify a
// person. `analytics.ts` binds it to the bundled posthog-js at runtime.
//
// Events recorded before 2026-09-29 carry the legacy site_id "wrench". Queries
// that span that change must match both ids.
export const SITE_ID = "ghostget" as const;
export const LEGACY_SITE_IDS = ["wrench"] as const;
export const SCHEMA_VERSION = 2 as const;
export const CANONICAL_DOMAIN = "ghostget.com" as const;
const CANONICAL_ORIGIN = `https://${CANONICAL_DOMAIN}` as const;
/** Build-time route of the rendered page; empty on the 404 page. */
export const ANALYTICS_ROUTE_META = "ghostget-analytics-route" as const;
export const NOT_FOUND_PATH = "/not-found" as const;

/**
 * Schema version 2 renamed or reshaped three interaction events. Queries that
 * cross the version boundary group by `analytics_schema_version`.
 */
export const SCHEMA_V2_EVENT_CHANGES = [
  {
    v1: "project link opened {target_id, target_kind, target_host, target_path}",
    v2: "outbound link opened {target_host, placement, link_kind}",
  },
  { v1: "cta clicked {cta}", v2: "cta clicked {cta, placement}" },
  {
    v1: "install command copied {install_command: cli | agent_skill}",
    v2: "install command copied {install_method: bun | npm, placement}",
  },
] as const;

export const CUSTOM_EVENTS = [
  "cta clicked",
  "install command copied",
  "outbound link opened",
  "page not found",
] as const;
const ALLOWED_EVENTS: ReadonlySet<string> = new Set([
  "$exception",
  "$pageleave",
  "$pageview",
  "$web_vitals",
  ...CUSTOM_EVENTS,
]);

export const PLACEMENTS = new Set([
  "docs",
  "footer",
  "hero",
  "inline",
  "modal",
  "nav",
  "not_found",
  "pricing",
  "sticky",
]);
export const CTA_PLACEMENTS: ReadonlyMap<string, string> = new Map([
  ["final-install", "inline"],
  ["header-install", "nav"],
  ["hero-install", "hero"],
  ["hero-see-it-work", "hero"],
]);
export const INSTALL_METHODS = new Set(["brew", "bun", "cargo", "curl", "go", "npm", "other", "pip"]);
/** Page install controls name their command; the event carries only the method. */
export const INSTALL_COMMAND_METHODS: ReadonlyMap<string, string> = new Map([
  ["agent_skill", "npm"],
  ["cli", "bun"],
]);
export const LINK_KINDS = new Set(["docs", "github", "other", "portfolio", "social"]);
export const INSTALL_COPIED_EVENT = "ghostget:install-command-copied" as const;

export const ATTRIBUTION_PARAMETERS: ReadonlySet<string> = new Set([
  "dclid",
  "epik",
  "fbclid",
  "gad_source",
  "gbraid",
  "gclid",
  "igshid",
  "irclid",
  "li_fat_id",
  "mc_cid",
  "msclkid",
  "rdt_cid",
  "sccid",
  "ttclid",
  "twclid",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
  "wbraid",
]);
const CURRENT_URL_KEYS = new Set([
  "$current_url",
  "$initial_current_url",
  "$session_entry_url",
]);
const REFERRER_KEYS = new Set([
  "$initial_referrer",
  "$referrer",
  "$session_entry_referrer",
]);
/** A generous ceiling: posthog-js sends roughly 60-90 built-in properties. */
const MAX_PROPERTIES = 200;
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 2_048;
const MAX_VALUE_LENGTH = 256;
const PRIVATE_PATH = "/private";
const DROPPED_PROPERTIES = new Set(["_kx", "campaign_params", "gclsrc", "qclid", "ref"]);
const PERSONAL_PROPERTIES = new Set([
  "code", "email", "key", "password", "secret", "token", "state", "access_token",
  "refresh_token", "id_token", "session_token", "api_key", "authorization",
]);

/** Legacy page kinds stay stable so version 1 per-page history lines up. */
const PAGE_KINDS: ReadonlyMap<string, string> = new Map([
  ["/", "product_landing"],
  ["/about", "about"],
  ["/contact", "contact"],
  ["/docs", "docs_index"],
  ["/docs/tutorials/getting-started", "getting_started"],
  ["/docs/how-to/capture-and-archive", "capture_and_archives"],
  ["/docs/how-to/connect-beeper", "provider_beeper"],
  ["/docs/how-to/export-whatsapp", "provider_whatsapp"],
  ["/docs/how-to/author-provider-plugin", "plugin_authoring"],
  ["/docs/explanation/security-model", "security"],
  ["/docs/reference/provider-capabilities", "provider_capabilities"],
  ["/privacy", "privacy"],
  ["/compare", "compare_index"],
  ["/blog", "blog_index"],
  ["/providers", "providers_index"],
]);

export type AnalyticsCapture = Readonly<{
  event: string;
  properties: Readonly<Record<string, unknown>>;
  timestamp?: string;
  uuid?: string;
}>;

export type BrowserEvidence = Readonly<{
  href: string;
  referrer: string;
  /** The page's build-time canonical path, or null on the 404 page. */
  route: string | null;
}>;

export type AnalyticsRoute = Readonly<{
  canonicalPath: string;
  contentGroup: string;
  contentSlug?: string;
  pageKind: string;
  /** The normalized path the browser requested. */
  requestedPath: string;
  stripAttribution?: boolean;
}>;

function unknownRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Readonly<Record<string, unknown>>;
}

export function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/u, 1)[0] ?? "/";
  const leading = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const collapsed = leading.replace(/\/{2,}/gu, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/u, "") : "/";
}

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/u, "").replace(/^www\./u, "");
}

function pageKindSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 64) || "page";
}

export function routeForPath(canonicalPath: string): Omit<AnalyticsRoute, "requestedPath"> {
  const path = normalizePathname(canonicalPath);
  const segments = path.split("/").filter(Boolean);
  const section = segments[0] ?? "home";
  const legacy = PAGE_KINDS.get(path);
  if (segments[0] === "blog" && segments.length === 2) {
    return { canonicalPath, contentGroup: "blog", contentSlug: segments[1]!, pageKind: "article" };
  }
  if (segments[0] === "providers" && segments.length === 2) {
    return { canonicalPath, contentGroup: "providers", contentSlug: segments[1]!, pageKind: "provider_site" };
  }
  return {
    canonicalPath,
    contentGroup: pageKindSlug(section),
    pageKind: legacy ?? pageKindSlug(segments.join("_")),
  };
}

function boundedPath(path: string): string {
  if (isSensitivePath(path)) return PRIVATE_PATH;
  return redactText(normalizePathname(path)).slice(0, MAX_VALUE_LENGTH);
}

function isSensitivePath(path: string): boolean {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { return true; }
  return /(?:^|\/)(?:auth|account|billing|checkout|invite|callback|oauth|token|login|logout|sign-in|sign-up|signin|signup|reset-password)(?:\/|$)/iu.test(normalizePathname(decoded));
}

function isSensitiveLocation(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { return isSensitivePath(new URL(value, CANONICAL_ORIGIN).pathname); } catch { return true; }
}

/**
 * Resolves the page a capture belongs to. The build writes each public page's
 * canonical path into the page, so only a URL on the canonical host whose path
 * matches that route is a public page; anything else is a not-found render.
 * Returns null for any other host, which drops the event.
 */
export function resolveRoute(rawUrl: string, evidence: BrowserEvidence): AnalyticsRoute | null {
  let url: URL;
  try {
    url = new URL(rawUrl, `${CANONICAL_ORIGIN}/`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || normalizeHost(url.hostname) !== CANONICAL_DOMAIN) return null;
  const requestedPath = boundedPath(url.pathname);
  if (isSensitivePath(url.pathname)) {
    return { canonicalPath: PRIVATE_PATH, requestedPath: PRIVATE_PATH, contentGroup: "not_found", pageKind: "not_found", stripAttribution: true };
  }
  if (evidence.route !== null && evidence.route !== "" && normalizePathname(evidence.route) === normalizePathname(url.pathname)) {
    return { ...routeForPath(evidence.route), requestedPath };
  }
  return {
    canonicalPath: NOT_FOUND_PATH,
    contentGroup: "not_found",
    pageKind: "not_found",
    requestedPath,
  };
}

function attributionQuery(url: URL): string {
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (ATTRIBUTION_PARAMETERS.has(key.toLowerCase()) && value !== "") {
      kept.append(key.toLowerCase(), redactText(value).slice(0, MAX_VALUE_LENGTH));
    }
  }
  const query = kept.toString();
  return query === "" ? "" : `?${query}`;
}

/** An own-host URL keeps its route and campaign tags; a 404 path collapses. */
function sanitizeOwnUrl(value: string, route: AnalyticsRoute, withOrigin: boolean): string {
  let url: URL;
  try {
    url = new URL(value, `${CANONICAL_ORIGIN}/`);
  } catch {
    return withOrigin ? `${CANONICAL_ORIGIN}${route.canonicalPath}` : route.canonicalPath;
  }
  if (normalizeHost(url.hostname) !== CANONICAL_DOMAIN) return url.origin;
  const samePage = normalizePathname(url.pathname) === normalizePathname(route.requestedPath);
  const path = samePage ? route.canonicalPath : boundedPath(url.pathname);
  return withOrigin ? `${CANONICAL_ORIGIN}${path}${route.stripAttribution || isSensitivePath(url.pathname) ? "" : attributionQuery(url)}` : path;
}

/** Third-party referrers reduce to their origin; own-host referrers keep the path. */
function sanitizeReferrer(value: string): string {
  if (value === "" || value === "$direct") return value;
  try {
    const url = new URL(value);
    if (normalizeHost(url.hostname) === CANONICAL_DOMAIN) return `${CANONICAL_ORIGIN}${boundedPath(url.pathname)}`;
    return url.origin;
  } catch {
    return "";
  }
}

function normalizedPropertyName(key: string): string {
  return key.toLowerCase().replace(/^\$/u, "").replace(/^(?:initial|session_entry)_/u, "");
}

function isPathnameKey(key: string): boolean {
  return /^\$?(?:(?:initial|session_entry|prev_pageview)_)?pathname$/u.test(key.toLowerCase());
}

export function redactText(value: string): string {
  return value
    .replace(/\b(?:phc|phx|phs|pha|phr)_[A-Za-z0-9_-]+\b/gu, "[credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [credential]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[credential]")
    .replace(/[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[email]")
    .replace(/(https?:\/\/[^\s?#)]+)(?:\?[^\s#)]*)?(?:#[^\s)]*)?/giu, "$1")
    .replace(/([/][^\s?#)]+)\?[^\s#)]*/gu, "$1")
    .replace(/\b(api[_-]?key|access[_-]?token|auth(?:orization)?|code|state|secret|password|token)=([^\s&]+)/giu, "$1=[redacted]")
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeString(key: string, value: string, route: AnalyticsRoute): string {
  if (REFERRER_KEYS.has(key) || normalizedPropertyName(key) === "referrer") return sanitizeReferrer(value);
  if (CURRENT_URL_KEYS.has(key) || normalizedPropertyName(key) === "current_url" || normalizedPropertyName(key) === "url") return sanitizeOwnUrl(value, route, true);
  if (isPathnameKey(key)) return sanitizeOwnUrl(value, route, false);
  if (ATTRIBUTION_PARAMETERS.has(normalizedPropertyName(key))) {
    return redactText(value).slice(0, MAX_VALUE_LENGTH);
  }
  return redactText(value);
}

function sanitizeValue(
  key: string,
  value: unknown,
  route: AnalyticsRoute,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  // The SDK derives search-engine query text from the original referrer URL.
  if (/^\$?(?:(?:initial|session_entry|prev_pageview)_)?ph_keyword$/iu.test(key)) return undefined;
  const name = normalizedPropertyName(key);
  if (DROPPED_PROPERTIES.has(name) || PERSONAL_PROPERTIES.has(name.replace(/-/gu, "_"))) return undefined;
  if (ATTRIBUTION_PARAMETERS.has(name) && (route.stripAttribution || typeof value !== "string")) return undefined;
  if (typeof value === "string") return sanitizeString(key, value, route);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (depth >= MAX_DEPTH || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(key, item, route, depth + 1, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [nestedKey, nestedValue] of Object.entries(value).slice(0, MAX_PROPERTIES)) {
    const safeValue = sanitizeValue(nestedKey, nestedValue, route, depth + 1, seen);
    if (safeValue !== undefined) result[nestedKey] = safeValue;
  }
  return result;
}

export function trafficForReferrer(referrer: string): Readonly<Record<string, string>> {
  if (!referrer || referrer === "$direct") return { traffic_channel: "direct", traffic_source: "direct" };
  let hostname: string;
  try {
    hostname = normalizeHost(new URL(referrer).hostname);
  } catch {
    return { traffic_channel: "referral", traffic_source: "unknown" };
  }
  if (hostname === CANONICAL_DOMAIN) {
    return { referrer_host: hostname, traffic_channel: "internal", traffic_source: "internal" };
  }
  const knownSources = [
    ["ai_referral", "chatgpt", ["chatgpt.com", "chat.openai.com"]],
    ["ai_referral", "claude", ["claude.ai"]],
    ["ai_referral", "perplexity", ["perplexity.ai"]],
    ["ai_referral", "gemini", ["gemini.google.com"]],
    ["organic_search", "google", ["google.com", "google.co.uk", "google.ca", "google.com.au"]],
    ["organic_search", "bing", ["bing.com"]],
    ["organic_search", "duckduckgo", ["duckduckgo.com"]],
    ["social", "reddit", ["reddit.com"]],
    ["social", "x", ["x.com", "twitter.com", "t.co"]],
    ["social", "linkedin", ["linkedin.com"]],
    ["social", "threads", ["threads.net", "threads.com"]],
  ] as const;
  for (const [channel, source, domains] of knownSources) {
    if (domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return { referrer_host: hostname, traffic_channel: channel, traffic_source: source };
    }
  }
  return { referrer_host: hostname, traffic_channel: "referral", traffic_source: hostname };
}

function isHostname(value: unknown): value is string {
  return typeof value === "string" && value.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value);
}

/** Per-event property rules; a custom event that breaks them is dropped. */
function eventPropertiesValid(event: string, properties: Readonly<Record<string, unknown>>): boolean {
  switch (event) {
    case "cta clicked":
      return typeof properties.cta === "string"
        && CTA_PLACEMENTS.get(properties.cta) === properties.placement;
    case "install command copied":
      return typeof properties.install_method === "string"
        && INSTALL_METHODS.has(properties.install_method)
        && typeof properties.placement === "string"
        && PLACEMENTS.has(properties.placement);
    case "outbound link opened":
      return isHostname(properties.target_host)
        && properties.target_host !== CANONICAL_DOMAIN
        && typeof properties.placement === "string"
        && PLACEMENTS.has(properties.placement)
        && (properties.link_kind === undefined
          || (typeof properties.link_kind === "string" && LINK_KINDS.has(properties.link_kind)));
    case "$exception":
      return properties.error_surface === "client"
        && typeof properties.error_fingerprint === "string"
        && typeof properties.error_origin === "string";
    default:
      return true;
  }
}

export function sanitizeCapture(
  value: unknown,
  evidence: BrowserEvidence,
): AnalyticsCapture | null {
  const capture = unknownRecord(value);
  if (capture === null || typeof capture.event !== "string" || !ALLOWED_EVENTS.has(capture.event)) {
    return null;
  }
  const properties = unknownRecord(capture.properties);
  if (properties === null || !eventPropertiesValid(capture.event, properties)) return null;
  const token = properties.token;
  if (typeof token !== "string" || !/^phc_[A-Za-z0-9_-]+$/u.test(token)) return null;
  const rawUrl = typeof properties.$current_url === "string" ? properties.$current_url : evidence.href;
  const resolvedRoute = resolveRoute(rawUrl, evidence);
  if (resolvedRoute === null) return null;
  // A sensitive initial or session-entry URL must not donate retained campaign
  // super-properties to a later public page.
  const route = { ...resolvedRoute, stripAttribution: resolvedRoute.stripAttribution ||
    [evidence.href, rawUrl, ...Object.entries(properties).filter(([key]) =>
      isPathnameKey(key) || ["current_url", "url"].includes(normalizedPropertyName(key))).map(([, item]) => item)].some(isSensitiveLocation) };
  if (capture.event === "page not found" && route.pageKind !== "not_found") return null;
  const safeProperties: Record<string, unknown> = {};
  const seen = new WeakSet<object>();
  for (const [key, propertyValue] of Object.entries(properties).slice(0, MAX_PROPERTIES)) {
    const safeValue = sanitizeValue(key, propertyValue, route, 0, seen);
    if (safeValue !== undefined) safeProperties[key] = safeValue;
  }
  const rawReferrer = typeof properties.$referrer === "string" ? properties.$referrer : evidence.referrer;
  const traffic = trafficForReferrer(rawReferrer);
  return {
    event: capture.event,
    properties: {
      ...safeProperties,
      ...traffic,
      ...(capture.event === "page not found"
        ? { requested_path: route.requestedPath, referrer_host: traffic.referrer_host ?? null }
        : {}),
      $host: CANONICAL_DOMAIN,
      $pathname: route.canonicalPath,
      $process_person_profile: false,
      analytics_schema_version: SCHEMA_VERSION,
      canonical_domain: CANONICAL_DOMAIN,
      canonical_path: route.canonicalPath,
      content_group: route.contentGroup,
      ...(route.contentSlug === undefined ? {} : { content_slug: route.contentSlug }),
      page_kind: route.pageKind,
      site_id: SITE_ID,
      token,
    },
    ...(typeof capture.timestamp === "string" ? { timestamp: capture.timestamp } : {}),
    ...(typeof capture.uuid === "string" ? { uuid: capture.uuid } : {}),
  };
}

export function createBrowserConfig(host: string, evidence: BrowserEvidence, isAllowed: () => boolean = () => true): Readonly<Record<string, unknown>> {
  return {
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    advanced_disable_flags: true,
    api_host: host,
    autocapture: false,
    before_send: (capture: unknown) => isAllowed() ? sanitizeCapture(capture, evidence) : null,
    capture_dead_clicks: false,
    // Exceptions go through the budgeted reporter in analytics.ts.
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_pageleave: true,
    capture_pageview: true,
    capture_performance: {
      network_timing: false,
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "CLS", "FCP", "INP"],
      web_vitals_attribution: false,
    },
    cookieless_mode: "always",
    cross_subdomain_cookie: false,
    defaults: "2026-05-30",
    disable_capture_url_hashes: true,
    disable_conversations: true,
    // The SDK is bundled; it must never fetch remote code.
    disable_external_dependency_loading: true,
    disable_product_tours: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_surveys_automatic_display: true,
    disableDeviceModel: true,
    enable_recording_console_log: false,
    internal_or_test_user_hostname: null,
    mask_all_element_attributes: true,
    mask_all_text: true,
    // posthog-js masks ad click IDs under this flag; before_send scrubs
    // emails, tokens, and auth codes instead.
    mask_personal_data_properties: false,
    persistence: "memory",
    person_profiles: "never",
    properties_string_max_length: MAX_STRING_LENGTH,
    rageclick: false,
    rate_limiting: { events_burst_limit: 12, events_per_second: 2 },
    respect_dnt: true,
    // Do not retain a batch that could outlive a visitor’s consent.
    request_batching: false,
    ui_host: host.includes("eu.i.posthog.com") ? "https://eu.posthog.com" : "https://us.posthog.com",
  };
}

export type PostHogCaptureTarget = Readonly<{
  capture: (
    event: string,
    properties?: Readonly<Record<string, unknown>>,
    options?: Readonly<{ send_instantly?: boolean; transport?: "sendBeacon" }>,
  ) => unknown;
}>;

const BEACON = { send_instantly: true, transport: "sendBeacon" } as const;

export function captureCta(posthog: PostHogCaptureTarget, cta: string): void {
  const placement = CTA_PLACEMENTS.get(cta);
  if (placement === undefined) return;
  posthog.capture("cta clicked", { cta, placement }, BEACON);
}

export function captureInstallCommandCopied(
  posthog: PostHogCaptureTarget,
  command: string,
  placement: string,
): void {
  const method = INSTALL_COMMAND_METHODS.get(command);
  if (method === undefined || !PLACEMENTS.has(placement)) return;
  posthog.capture("install command copied", { install_method: method, placement });
}

export function linkKindForHost(host: string): string {
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (["x.com", "twitter.com", "linkedin.com", "www.linkedin.com", "reddit.com", "threads.net", "bsky.app"].includes(host)) {
    return "social";
  }
  if (host === "hraness.com" || host.endsWith(".hraness.com")) return "portfolio";
  if (host.startsWith("docs.")) return "docs";
  return "other";
}

export function captureOutboundLink(
  posthog: PostHogCaptureTarget,
  href: string,
  placement: string,
): void {
  let host: string;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    host = url.hostname.toLowerCase();
  } catch {
    return;
  }
  if (normalizeHost(host) === CANONICAL_DOMAIN || !PLACEMENTS.has(placement)) return;
  posthog.capture("outbound link opened", {
    link_kind: linkKindForHost(host),
    placement,
    target_host: host,
  }, BEACON);
}

/** Default placement for page-level controls that carry no explicit placement. */
export function placementForPath(pathname: string): string {
  const path = normalizePathname(pathname);
  if (path === "/") return "hero";
  if (path === "/docs" || path.startsWith("/docs/")) return "docs";
  return "inline";
}

/**
 * PostHog ignores `respect_dnt` when `cookieless_mode` is "always", so the
 * bootstrap checks Do Not Track itself and never initializes the SDK when set.
 */
export function doNotTrackEnabled(
  navigatorValue: Readonly<{ doNotTrack?: string | null | undefined; msDoNotTrack?: string | null | undefined }> | undefined,
  windowValue: Readonly<{ doNotTrack?: string | null | undefined }> | undefined,
): boolean {
  return [navigatorValue?.doNotTrack, navigatorValue?.msDoNotTrack, windowValue?.doNotTrack].some(
    (value) => typeof value === "string" && ["1", "yes", "true"].includes(value.trim().toLowerCase()),
  );
}

const MAX_ERROR_MESSAGE_LENGTH = 512;
const MAX_ERROR_STACK_LENGTH = 4_096;

/** A scrubbed copy of a thrown value: no query strings, emails, or credentials. */
export function sanitizeError(value: unknown): Error {
  const source = value instanceof Error ? value : new Error(typeof value === "string" ? value : "Non-error rejection");
  const sanitized = new Error(redactText(source.message).slice(0, MAX_ERROR_MESSAGE_LENGTH));
  sanitized.name = redactText(source.name).slice(0, 64) || "Error";
  if (typeof source.stack === "string") {
    sanitized.stack = redactText(source.stack).slice(0, MAX_ERROR_STACK_LENGTH);
  } else {
    delete sanitized.stack;
  }
  return sanitized;
}

export function errorFingerprint(error: Error): string {
  const stackFrames = error.stack?.split("\n").slice(1, 3).join("\n") ?? "";
  const input = `${error.name}\n${error.message}\n${stackFrames}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `e_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** The portfolio browser budget: 20 exceptions a minute, 2 per fingerprint. */
export class ExceptionBudget {
  readonly #totalLimit: number;
  readonly #perFingerprintLimit: number;
  readonly #windowMs: number;
  #all: number[] = [];
  #byFingerprint = new Map<string, number[]>();

  constructor(options: Readonly<{ totalLimit: number; perFingerprintLimit: number; windowMs: number }> = {
    perFingerprintLimit: 2,
    totalLimit: 20,
    windowMs: 60_000,
  }) {
    this.#totalLimit = options.totalLimit;
    this.#perFingerprintLimit = options.perFingerprintLimit;
    this.#windowMs = options.windowMs;
  }

  allow(fingerprint: string, now = Date.now()): boolean {
    const cutoff = now - this.#windowMs;
    this.#all = this.#all.filter((time) => time > cutoff);
    for (const [key, times] of this.#byFingerprint) {
      const current = times.filter((time) => time > cutoff);
      if (current.length === 0) this.#byFingerprint.delete(key);
      else this.#byFingerprint.set(key, current);
    }
    const times = this.#byFingerprint.get(fingerprint) ?? [];
    if (this.#all.length >= this.#totalLimit || times.length >= this.#perFingerprintLimit) return false;
    this.#all.push(now);
    this.#byFingerprint.set(fingerprint, [...times, now]);
    return true;
  }
}

export type PostHogExceptionTarget = Readonly<{
  captureException: (error: Error, properties?: Readonly<Record<string, unknown>>) => unknown;
}>;

export function createExceptionReporter(
  posthog: PostHogExceptionTarget,
  budget = new ExceptionBudget(),
): (value: unknown, origin: string) => boolean {
  const seen = new WeakSet<object>();
  return (value, origin) => {
    if (value !== null && typeof value === "object") {
      if (seen.has(value)) return false;
      seen.add(value);
    }
    const error = sanitizeError(value);
    const fingerprint = errorFingerprint(error);
    if (!budget.allow(fingerprint)) return false;
    posthog.captureException(error, {
      error_fingerprint: fingerprint,
      error_origin: origin,
      error_surface: "client",
    });
    return true;
  };
}
