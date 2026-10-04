import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readAttempt } from "../read-effect";
import { readNative } from "../read-effect-platform";
import type { LinkedInSearchBrowserTransport } from "./linkedin-web-search-browser";
import type { LinkedInSearchTarget } from "./linkedin-web-search";

export type LinkedInSearchNative = {
  readonly openBrowser: () => Promise<LinkedInSearchBrowserTransport>;
  readonly observedAt: () => string;
};

function platform(ports: LinkedInSearchNative) {
  return {
    openBrowser: readNative(ports.openBrowser).pipe(Effect.uninterruptible),
    page: (browser: LinkedInSearchBrowserTransport, target: LinkedInSearchTarget) =>
      readNative(() => browser.openSearch(target)).pipe(Effect.uninterruptible),
    advance: (browser: LinkedInSearchBrowserTransport) =>
      readNative(() => browser.advancePager()).pipe(Effect.uninterruptible),
    observedAt: readAttempt(ports.observedAt),
    closeBrowser: (browser: LinkedInSearchBrowserTransport) =>
      readNative(() => browser.close()).pipe(Effect.uninterruptible),
  };
}

export class LinkedInSearchPlatform extends Context.Tag("wrench/LinkedInSearchPlatform/v1")<
  LinkedInSearchPlatform,
  ReturnType<typeof platform>
>() { }

export const LinkedInSearchPlatformLive = (ports: LinkedInSearchNative): Layer.Layer<LinkedInSearchPlatform> =>
  Layer.succeed(LinkedInSearchPlatform, platform(ports));
