// Child-process harness for analytics.test.ts: loads the pinned posthog-js
// build that ships in the site bundle under a minimal browser shape, runs the
// real browser config, and reports what before_send received and returned plus
// the request bodies handed to fetch. Browser globals stay in this process.
export {};

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const href = process.env.HARNESS_HREF ?? "https://ghostget.com/";
const referrer = process.env.HARNESS_REFERRER ?? "";
const route = process.env.HARNESS_ROUTE ?? "/";
const pageLocation = new URL(href);
const listeners = { addEventListener() {}, removeEventListener() {} };
const pageDocument = {
  ...listeners,
  body: null,
  URL: href,
  cookie: "",
  createElement: () => ({ ...listeners, setAttribute() {}, style: {} }),
  documentElement: {},
  getElementsByTagName: () => [],
  location: pageLocation,
  querySelector: () => null,
  querySelectorAll: () => [],
  readyState: "complete",
  referrer,
  title: "GhostGet",
  visibilityState: "visible",
};
const sent: unknown[] = [];
Object.assign(globalThis, {
  document: pageDocument,
  fetch: async (_url: string, init: { body?: unknown }) => {
    sent.push(init.body);
    return new Response("{\"status\":1}", { status: 200 });
  },
  location: pageLocation,
  navigator: { doNotTrack: null, language: "en-US", languages: ["en-US"], onLine: true, userAgent, webdriver: false },
  screen: { height: 900, width: 1440 },
  window: globalThis,
});
Object.assign(globalThis, { innerHeight: 900, innerWidth: 1440, ...listeners });

const { default: posthog } = await import("posthog-js/dist/module.no-external");
const { createBrowserConfig, createExceptionReporter, sanitizeCapture } = await import("./source/analytics-contract");
const token = "phc_harnesstoken";
const evidence = { href, referrer, route: route === "" ? null : route };
const config = createBrowserConfig("https://us.i.posthog.com", evidence);
const received: unknown[] = [];
const returned: unknown[] = [];
posthog.init(token, {
  ...config,
  before_send: (event: unknown) => {
    received.push(structuredClone(event));
    const result = sanitizeCapture(event, evidence);
    returned.push(structuredClone(result));
    return result;
  },
  capture_pageview: false,
  request_batching: false,
} as Parameters<typeof posthog.init>[1]);
const instantly = { send_instantly: true, transport: "fetch" } as const;
// Test-only captures, not site events: `$autocapture` must be dropped.
const probes: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ["$pageview", {}],
  ["$pageleave", {}],
  ["outbound link opened", { link_kind: "github", placement: "nav", target_host: "github.com" }],
  ["page not found", {}],
  ["$autocapture", {}],
];
for (const [event, properties] of probes) posthog.capture(event, properties, instantly);
createExceptionReporter(posthog)(new Error("failed https://ghostget.com/docs/?email=reader@example.com"), "window_error");
for (const deadline = Date.now() + 5_000; sent.length < 3 && Date.now() < deadline;) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
await new Promise((resolve) => setTimeout(resolve, 50));
const decoder = new TextDecoder();
const bodies = sent.map((body) => {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body as ArrayBuffer);
  return JSON.parse(decoder.decode(bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes) : bytes)) as unknown;
});
process.stdout.write(JSON.stringify({ bodies, received, returned }));
process.exit(0);
