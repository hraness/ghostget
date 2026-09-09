import * as Effect from "effect/Effect";
import { PreservedBrowserArtifactsError } from "../browser";
import { readAttempt, type ReadEffectFailure, withReadResource } from "../read-effect";
import type { WebSessionExecution } from "../web-session-execution";
import { LinkedInContactPlatform } from "./linkedin-contact-platform";
import {
  linkedInContactDiagnostic,
  linkedInContactReadFailure,
  type LinkedInContactStage,
} from "./linkedin-contact-failure";
import {
  projectLinkedInContactInfo,
  projectLinkedInProfileContactBinding,
  type LinkedInContactInfoTarget,
} from "./linkedin-web-contact";

export function linkedInContactReadProgram(
  target: LinkedInContactInfoTarget,
): Effect.Effect<WebSessionExecution, ReadEffectFailure, LinkedInContactPlatform> {
  return Effect.gen(function*() {
    const platform = yield* LinkedInContactPlatform;
    let stage: LinkedInContactStage = "identity";
    let closeFailed = false;
    return yield* withReadResource(
      platform.openBrowser,
      browser => Effect.gen(function*() {
        const identity = yield* platform.identity(browser);
        yield* platform.bindIdentity(identity);
        stage = "profile";
        const profileHtml = yield* platform.profileHtml(browser, target.url);
        yield* readAttempt(() => projectLinkedInProfileContactBinding({
          profileHtml,
          profileUrl: target.url,
          expectedViewerSubject: identity.subject,
        }));
        stage = "contact";
        const contactPayload = yield* platform.contactPayload(browser, target.url);
        stage = "projection";
        const observedAt = yield* platform.observedAt;
        const output = yield* readAttempt(() => projectLinkedInContactInfo({
          profileHtml,
          contactPayload,
          profileUrl: target.url,
          expectedViewerSubject: identity.subject,
          observedAt,
        }));
        return {
          status: "succeeded" as const,
          output,
          finalUrl: target.url,
          dispatchStarted: false,
          dispatch: { planned: 0, started: 0, verified: 0 },
        };
      }),
      browser => platform.closeBrowser(browser).pipe(Effect.tapError(() => Effect.sync(() => { closeFailed = true; }))),
    ).pipe(Effect.catchTag("ReadEffectFailure", error => {
      if (closeFailed || error.cause instanceof PreservedBrowserArtifactsError) return Effect.fail(error);
      return Effect.succeed({
        status: "failed" as const,
        output: null,
        finalUrl: target.url,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: linkedInContactDiagnostic(error.cause, stage),
        readFailure: linkedInContactReadFailure(error.cause, stage),
      });
    }));
  });
}
