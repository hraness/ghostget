import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { PreservedBrowserArtifactsError } from "../browser";
import { readAttempt, type ReadEffectFailure, withReadResource } from "../read-effect";
import { readFailureProjection, type WebSessionExecution } from "../web-session-execution";
import { LinkedInCompanyPlatform, type LinkedInCompanyIdentity } from "./linkedin-company-platform";
import {
  linkedInProfileIdentityAllowsBrowserFallback,
  linkedInProfileReadFailure,
} from "./linkedin-read-failure";
import { projectLinkedInOrganizationStats, type LinkedInProfileTarget } from "./linkedin-web";

/** The signed-in member authorizes the read; the company target is independently
 * bound by the pure projection and need not match the member's personal slug. */
export function linkedInCompanyReadProgram(
  target: LinkedInProfileTarget,
  preferBrowser: boolean,
  diagnostic: (error: unknown, requestStage: string) => string,
): Effect.Effect<WebSessionExecution, ReadEffectFailure, LinkedInCompanyPlatform> {
  return Effect.gen(function*() {
    const platform = yield* LinkedInCompanyPlatform;
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
          : linkedInProfileReadFailure(error.cause),
      });
    };
    const readBoundCompany = (
      identity: LinkedInCompanyIdentity,
      browser: boolean,
      company: Effect.Effect<string, ReadEffectFailure>,
    ): Effect.Effect<WebSessionExecution, ReadEffectFailure> => Effect.gen(function*() {
      yield* platform.bindIdentity(identity).pipe(Effect.tapError(() => Effect.sync(() => { identityMismatch = true; })));
      requestStage = browser ? "contained-browser public company page read" : "public company page read";
      const html = yield* company;
      requestStage = "exact company metric projection";
      const observedAt = yield* platform.observedAt;
      const output = yield* readAttempt(() => projectLinkedInOrganizationStats({
        html,
        organizationUrl: target.url,
        observedAt,
      }));
      return {
        status: "succeeded",
        output,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
      };
    });
    const browserRead = (): Effect.Effect<WebSessionExecution, ReadEffectFailure> => {
      let closeFailed = false;
      return withReadResource(
        platform.openBrowser,
        browser => platform.browserIdentity(browser).pipe(Effect.flatMap(identity => readBoundCompany(
          identity, true, platform.browserCompany(browser, target.url),
        ))),
        browser => platform.closeBrowser(browser).pipe(Effect.tapError(() => Effect.sync(() => { closeFailed = true; }))),
      ).pipe(Effect.catchTag("ReadEffectFailure", error => closeFailed ? Effect.fail(error) : report(error)));
    };
    if (preferBrowser) return yield* browserRead();
    const direct = yield* Effect.either(platform.openDirect);
    if (Either.isLeft(direct)) return yield* report(direct.left);
    const identity = yield* Effect.either(platform.directIdentity(direct.right));
    if (Either.isLeft(identity)) {
      if (linkedInProfileIdentityAllowsBrowserFallback(identity.left.cause)) {
        requestStage = "contained-browser signed-in identity preflight";
        return yield* browserRead();
      }
      return yield* report(identity.left);
    }
    return yield* readBoundCompany(
      identity.right, false, platform.directCompany(direct.right, target.url),
    ).pipe(Effect.catchTag("ReadEffectFailure", report));
  });
}
