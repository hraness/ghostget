import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ReadEffectFailure, readAttempt } from "../read-effect";
import type { WebSessionClient } from "../web-session-client";
import type { LinkedInProfileBrowserTransport } from "./linkedin-web-profile-browser";

export type LinkedInSelfIdentity = {
  readonly subject: string;
  readonly publicIdentifier: string | null;
};

export type LinkedInSelfNative = {
  readonly openBrowser: () => Promise<LinkedInProfileBrowserTransport>;
  readonly openDirect: () => Promise<WebSessionClient>;
  readonly directIdentity: (client: WebSessionClient) => Promise<LinkedInSelfIdentity>;
  readonly decodeIdentity: (value: unknown) => LinkedInSelfIdentity;
  readonly bindIdentity: (identity: LinkedInSelfIdentity) => string;
  readonly readProfile: (client: WebSessionClient, url: string) => Promise<string>;
  readonly readConnections: (client: WebSessionClient, url: string) => Promise<string>;
  readonly observedAt: () => string;
};

const native = <A>(work: () => Promise<A>): Effect.Effect<A, ReadEffectFailure> =>
  Effect.tryPromise({ try: work, catch: cause => new ReadEffectFailure({ cause }) });

function platform(ports: LinkedInSelfNative) {
  return {
    openBrowser: native(ports.openBrowser),
    closeBrowser: (browser: LinkedInProfileBrowserTransport) => native(() => browser.close()),
    browserIdentity: (browser: LinkedInProfileBrowserTransport) => native(() => browser.currentIdentityResponse()).pipe(Effect.flatMap(value => readAttempt(() => ports.decodeIdentity(value)))),
    openDirect: native(ports.openDirect),
    directIdentity: (client: WebSessionClient) => native(() => ports.directIdentity(client)),
    bindIdentity: (identity: LinkedInSelfIdentity) => readAttempt(() => ports.bindIdentity(identity)),
    browserProfile: (
      browser: LinkedInProfileBrowserTransport,
      url: string

    ) => native(() => browser.readProfileHtml(url)),
    browserConnections: (
      browser: LinkedInProfileBrowserTransport,
      url: string

    ) => native(() => browser.readConnectionsHtml(url)),
    directProfile: (client: WebSessionClient, url: string) => native(() => ports.readProfile(client, url)),
    directConnections: (client: WebSessionClient, url: string) => native(() => ports.readConnections(client, url)),
    observedAt: readAttempt(ports.observedAt),
  };
}

export class LinkedInSelfPlatform extends Context.Tag("wrench/LinkedInSelfPlatform/v1")<LinkedInSelfPlatform, ReturnType<typeof platform>>() { }

export const LinkedInSelfPlatformLive = (ports: LinkedInSelfNative): Layer.Layer<LinkedInSelfPlatform> => Layer.succeed(LinkedInSelfPlatform, platform(ports));
