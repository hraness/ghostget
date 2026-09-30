// ghostget.com browser analytics. The pinned posthog-js build is bundled into
// this module, so the page never loads remote SDK code. The event contract and
// every scrub rule live in `analytics-contract.ts`.
import posthog from "posthog-js/dist/module.no-external";
import "posthog-js/dist/web-vitals.js";
import {
  ANALYTICS_ROUTE_META,
  CANONICAL_DOMAIN,
  INSTALL_COPIED_EVENT,
  PLACEMENTS,
  captureCta,
  captureInstallCommandCopied,
  captureOutboundLink,
  createBrowserConfig,
  createExceptionReporter,
  doNotTrackEnabled,
  normalizeHost,
  placementForPath,
  resolveRoute,
  type BrowserEvidence,
  type PostHogCaptureTarget,
} from "./analytics-contract";

export * from "./analytics-contract";

function metaContent(documentValue: Document, name: string): string | null {
  return documentValue.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content.trim() ?? null;
}

function placementFor(element: Element): string {
  const explicit = element.closest<HTMLElement>("[data-analytics-placement]")?.dataset.analyticsPlacement;
  if (explicit !== undefined && PLACEMENTS.has(explicit)) return explicit;
  if (element.closest("header, nav") !== null) return "nav";
  if (element.closest("footer") !== null) return "footer";
  return placementForPath(window.location.pathname);
}

function initializeBrowserAnalytics(): void {
  const key = metaContent(document, "ghostget-posthog-key") ?? "";
  const host = metaContent(document, "ghostget-posthog-host") ?? "";
  if (
    window.location.protocol !== "https:"
    || normalizeHost(window.location.hostname) !== CANONICAL_DOMAIN
    || !/^phc_[A-Za-z0-9_-]+$/u.test(key)
    || !/^https:\/\/(?:eu|us)\.i\.posthog\.com$/u.test(host)
    || doNotTrackEnabled(
      navigator as Navigator & { msDoNotTrack?: string | null },
      window as Window & { doNotTrack?: string | null },
    )
  ) return;

  const evidence: BrowserEvidence = {
    href: window.location.href,
    referrer: document.referrer,
    route: metaContent(document, ANALYTICS_ROUTE_META),
  };
  posthog.init(key, createBrowserConfig(host, evidence) as Parameters<typeof posthog.init>[1]);
  const target = posthog as unknown as PostHogCaptureTarget;

  const route = resolveRoute(window.location.href, evidence);
  if (route?.pageKind === "not_found") posthog.capture("page not found");

  const reportException = createExceptionReporter(posthog);
  window.addEventListener("error", (event) => {
    if (event.error instanceof Error) reportException(event.error, "window_error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportException(event.reason, "unhandled_rejection");
  });

  document.addEventListener(INSTALL_COPIED_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail as unknown : undefined;
    const command = detail !== null && typeof detail === "object" ? (detail as { command?: unknown }).command : undefined;
    if (typeof command === "string" && event.target instanceof Element) {
      captureInstallCommandCopied(target, command, placementFor(event.target));
    }
  });

  document.addEventListener("copy", () => {
    const anchor = document.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const control = element?.closest<HTMLElement>("[data-install-command]");
    const command = control?.dataset.installCommand;
    if (control && command !== undefined) captureInstallCommandCopied(target, command, placementFor(control));
  });

  document.addEventListener("click", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const cta = event.target.closest<HTMLAnchorElement>("a[data-analytics-cta]")?.dataset.analyticsCta;
    if (cta !== undefined) captureCta(target, cta);
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (link !== null) captureOutboundLink(target, link.href, placementFor(link));
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeBrowserAnalytics();
}
