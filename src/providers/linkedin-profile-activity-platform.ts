import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ReadEffectFailure, readAttempt } from "../read-effect";
import { readNative } from "../read-effect-platform";
import type { LinkedInFeedBrowserTransport } from "./linkedin-web-feed-browser";
import { LinkedInProfileActivityIdentityMismatch } from "./linkedin-profile-activity-failure";

export type LinkedInProfileActivityIdentity = { readonly subject: string };

export type LinkedInProfileActivityNative = {
  readonly openBrowser: () => Promise<LinkedInFeedBrowserTransport>;
  readonly decodeIdentity: (value: unknown) => LinkedInProfileActivityIdentity;
  readonly bindIdentity: (identity: LinkedInProfileActivityIdentity) => string;
  readonly observedAt: () => string;
};

function platform(ports: LinkedInProfileActivityNative) {
  return {
    openBrowser: readNative(ports.openBrowser).pipe(Effect.uninterruptible),
    identity: (browser: LinkedInFeedBrowserTransport) => readNative(() => browser.currentIdentityResponse()).pipe(
      Effect.uninterruptible,
      Effect.flatMap(value => readAttempt(() => ports.decodeIdentity(value))),
    ),
    bindIdentity: (identity: LinkedInProfileActivityIdentity) => readAttempt(() => ports.bindIdentity(identity)).pipe(
      Effect.mapError(error => new ReadEffectFailure({ cause: new LinkedInProfileActivityIdentityMismatch(error.cause) })),
    ),
    binding: (browser: LinkedInFeedBrowserTransport, slug: string) => readNative(() => browser.resolveProfileActivityBinding(slug)).pipe(Effect.uninterruptible),
    page: (browser: LinkedInFeedBrowserTransport, count: number, start: number) => readNative(() => browser.readProfileActivityPage({ count, start })).pipe(Effect.uninterruptible),
    observedAt: readAttempt(ports.observedAt),
    closeBrowser: (browser: LinkedInFeedBrowserTransport) => readNative(() => browser.close()).pipe(Effect.uninterruptible),
  };
}

export class LinkedInProfileActivityPlatform extends Context.Tag("wrench/LinkedInProfileActivityPlatform/v1")<
  LinkedInProfileActivityPlatform,
  ReturnType<typeof platform>
>() { }

export const LinkedInProfileActivityPlatformLive = (ports: LinkedInProfileActivityNative): Layer.Layer<LinkedInProfileActivityPlatform> =>
  Layer.succeed(LinkedInProfileActivityPlatform, platform(ports));
