import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { PreservedBrowserArtifactsError } from "../browser";
import { readAttempt, type ReadEffectFailure, withReadResource } from "../read-effect";
import {
  readFailureProjection,
  type WebSessionExecution
} from "../web-session-execution";
import { LinkedInSelfPlatform, type LinkedInSelfIdentity } from "./linkedin-self-platform";
import { projectLinkedInPersonalProfileStats, type LinkedInProfileTarget } from "./linkedin-web";

import {
  linkedInProfileIdentityAllowsBrowserFallback,
  linkedInProfileReadFailure as linkedInSelfReadFailure
} from "./linkedin-read-failure";

export { linkedInSelfReadFailure };

export function linkedInSelfReadProgram(
  target: LinkedInProfileTarget,
  includeConnections: boolean,
  preferBrowser: boolean,
  diagnostic: (error: unknown, requestStage: string) => string

): Effect.Effect<WebSessionExecution, ReadEffectFailure, LinkedInSelfPlatform> {
  return Effect.gen(function*() {
    const platform = yield* LinkedInSelfPlatform;
    let requestStage = preferBrowser
      ? "contained-browser signed-in identity preflight"
      : "signed-in identity preflight";
    let identityMismatch = false;
    const report = (error: ReadEffectFailure): Effect.Effect<WebSessionExecution, ReadEffectFailure> => {
      if (error.cause instanceof PreservedBrowserArtifactsError) return Effect.fail(error);
      return Effect.succeed({
        status: "failed",
        output: null,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: diagnostic(error.cause, requestStage),
        readFailure: identityMismatch
          ? readFailureProjection("account-mismatch")
          : linkedInSelfReadFailure(error.cause)
      });
    };
    const readBoundProfile = (
      identity: LinkedInSelfIdentity,
      browser: boolean,
      profile: Effect.Effect<string, ReadEffectFailure>,
      connections: Effect.Effect<string, ReadEffectFailure>

    ): Effect.Effect<WebSessionExecution, ReadEffectFailure> => Effect.gen(function*() {
      const subject = yield* platform.bindIdentity(identity).pipe(Effect.tapError(() => Effect.sync(() => { identityMismatch = true; })));
      yield* readAttempt(() => {
        if (identity.publicIdentifier === null) throw new Error("LinkedIn current member omitted its bound public profile identifier");
        if (identity.publicIdentifier !== target.slug) {
          identityMismatch = true;
          throw new Error("LinkedIn current member public profile identifier does not match the requested profile URL");
        }
      });
      requestStage = browser ? "contained-browser public self-profile page read" : "public self-profile page read";
      const profileHtml = yield* profile;
      let connectionsHtml: string | null = null;
      if (includeConnections) {
        requestStage = browser
          ? "contained-browser private My Network connections page read"
          : "private My Network connections page read";
        connectionsHtml = yield* connections;
      }
      requestStage = "exact metric projection";
      const observedAt = yield* platform.observedAt;
      const output = yield* readAttempt(() => projectLinkedInPersonalProfileStats({
        profileHtml,
        connectionsHtml,
        profileUrl: target.url,
        expectedSubject: subject,
        expectedPublicIdentifier: identity.publicIdentifier,
        observedAt
      }));
      return {
        status: "succeeded",
        output,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    });
    const browserRead = (): Effect.Effect<WebSessionExecution, ReadEffectFailure> => {
      let closeFailed = false;
      return withReadResource(
        platform.openBrowser,
        browser => platform.browserIdentity(browser).pipe(Effect.flatMap(identity => readBoundProfile(
          identity,
          true,
          platform.browserProfile(browser, target.url),
          platform.browserConnections(browser, target.url)
        ))),
        browser => platform.closeBrowser(browser).pipe(Effect.tapError(() => Effect.sync(() => { closeFailed = true; }))),
      ).pipe(Effect.catchTag("ReadEffectFailure", error => closeFailed ? Effect.fail(error) : report(error)));
    };
    if (preferBrowser) return yield* browserRead();
    // A native close rejection must escape the safe read projection just as the
    // previous finally block did. Only acquisition/operation errors are mapped.
    const direct = yield* Effect.either(platform.openDirect);
    if (Either.isLeft(direct)) return yield* report(direct.left);
    const identity = yield* Effect.either(platform.directIdentity(direct.right));
    if (Either.isLeft(identity)) {
      const cause = identity.left.cause;
      if (linkedInProfileIdentityAllowsBrowserFallback(cause)) {
        requestStage = "contained-browser signed-in identity preflight";
        return yield* browserRead();
      }
      return yield* report(identity.left);
    }
    return yield* readBoundProfile(
      identity.right,
      false,
      platform.directProfile(direct.right, target.url),
      platform.directConnections(direct.right, target.url)
    ).pipe(Effect.catchTag("ReadEffectFailure", report));
  });
}
