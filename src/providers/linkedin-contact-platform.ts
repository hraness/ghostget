import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ReadEffectFailure, readAttempt } from "../read-effect";
import { readNative } from "../read-effect-platform";
import { LinkedInContactIdentityMismatch } from "./linkedin-contact-failure";
import type { LinkedInContactInfoJsonInput } from "./linkedin-web-contact";
import type { LinkedInProfileBrowserTransport } from "./linkedin-web-profile-browser";

export type LinkedInContactIdentity = { readonly subject: string };

export type LinkedInContactNative = {
  readonly openBrowser: () => Promise<LinkedInProfileBrowserTransport>;
  readonly decodeIdentity: (value: unknown) => LinkedInContactIdentity;
  readonly bindIdentity: (identity: LinkedInContactIdentity) => string;
  readonly observedAt: () => string;
};

function platform(ports: LinkedInContactNative) {
  return {
    openBrowser: readNative(ports.openBrowser).pipe(Effect.uninterruptible),
    identity: (browser: LinkedInProfileBrowserTransport) => readNative(() => browser.currentIdentityResponse()).pipe(
      Effect.uninterruptible,
      Effect.flatMap(value => readAttempt(() => ports.decodeIdentity(value))),
    ),
    bindIdentity: (identity: LinkedInContactIdentity) => readAttempt(() => ports.bindIdentity(identity)).pipe(
      Effect.mapError(error => new ReadEffectFailure({ cause: new LinkedInContactIdentityMismatch(error.cause) })),
    ),
    profileHtml: (browser: LinkedInProfileBrowserTransport, profileUrl: string) =>
      readNative(() => browser.readProfileHtml(profileUrl)).pipe(Effect.uninterruptible),
    contactPayload: (browser: LinkedInProfileBrowserTransport, input: LinkedInContactInfoJsonInput) =>
      readNative(() => browser.readContactInfoJson(input)).pipe(Effect.uninterruptible),
    observedAt: readAttempt(ports.observedAt),
    closeBrowser: (browser: LinkedInProfileBrowserTransport) =>
      readNative(() => browser.close()).pipe(Effect.uninterruptible),
  };
}

export class LinkedInContactPlatform extends Context.Tag("wrench/LinkedInContactPlatform/v1")<
  LinkedInContactPlatform,
  ReturnType<typeof platform>
>() { }

export const LinkedInContactPlatformLive = (ports: LinkedInContactNative): Layer.Layer<LinkedInContactPlatform> =>
  Layer.succeed(LinkedInContactPlatform, platform(ports));
