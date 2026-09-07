import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readAttempt } from "../read-effect";
import { readNative } from "../read-effect-platform";
import type { WebSessionClient } from "../web-session-client";
import type { LinkedInProfileBrowserTransport } from "./linkedin-web-profile-browser";

export type LinkedInCompanyIdentity = {
  readonly subject: string;
};

export type LinkedInCompanyNative = {
  readonly openBrowser: () => Promise<LinkedInProfileBrowserTransport>;
  readonly openDirect: () => Promise<WebSessionClient>;
  readonly directIdentity: (client: WebSessionClient) => Promise<LinkedInCompanyIdentity>;
  readonly decodeIdentity: (value: unknown) => LinkedInCompanyIdentity;
  readonly bindIdentity: (identity: LinkedInCompanyIdentity) => string;
  readonly readCompany: (client: WebSessionClient, url: string) => Promise<string>;
  readonly observedAt: () => string;
};

function platform(ports: LinkedInCompanyNative) {
  return {
    openBrowser: readNative(ports.openBrowser),
    closeBrowser: (browser: LinkedInProfileBrowserTransport) => readNative(() => browser.close()),
    browserIdentity: (browser: LinkedInProfileBrowserTransport) => readNative(() => browser.currentIdentityResponse()).pipe(
      Effect.flatMap(value => readAttempt(() => ports.decodeIdentity(value))),
    ),
    browserCompany: (browser: LinkedInProfileBrowserTransport, url: string) => readNative(() => browser.readOrganizationHtml(url)),
    openDirect: readNative(ports.openDirect),
    directIdentity: (client: WebSessionClient) => readNative(() => ports.directIdentity(client)),
    bindIdentity: (identity: LinkedInCompanyIdentity) => readAttempt(() => ports.bindIdentity(identity)),
    directCompany: (client: WebSessionClient, url: string) => readNative(() => ports.readCompany(client, url)),
    observedAt: readAttempt(ports.observedAt),
  };
}

export class LinkedInCompanyPlatform extends Context.Tag("wrench/LinkedInCompanyPlatform/v1")<LinkedInCompanyPlatform, ReturnType<typeof platform>>() { }

export const LinkedInCompanyPlatformLive = (ports: LinkedInCompanyNative): Layer.Layer<LinkedInCompanyPlatform> =>
  Layer.succeed(LinkedInCompanyPlatform, platform(ports));
