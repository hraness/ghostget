import * as Effect from "effect/Effect";
import { PreservedBrowserArtifactsError } from "../browser";
import { readAttempt, type ReadEffectFailure, withReadResource } from "../read-effect";
import type { WebSessionExecution } from "../web-session-execution";
import { LinkedInProfileActivityPlatform } from "./linkedin-profile-activity-platform";
import {
  linkedInProfileActivityDiagnostic,
  linkedInProfileActivityReadFailure,
  type LinkedInProfileActivityStage,
} from "./linkedin-profile-activity-failure";
import {
  projectLinkedInProfileActivityPage,
  type LinkedInProfileActivityTarget,
} from "./linkedin-web-feed";

export function linkedInProfileActivityReadProgram(
  target: LinkedInProfileActivityTarget,
  start: number,
  limit: number,
): Effect.Effect<WebSessionExecution, ReadEffectFailure, LinkedInProfileActivityPlatform> {
  return Effect.gen(function*() {
    const platform = yield* LinkedInProfileActivityPlatform;
    let stage: LinkedInProfileActivityStage = "identity";
    let closeFailed = false;
    return yield* withReadResource(
      platform.openBrowser,
      browser => Effect.gen(function*() {
        const identity = yield* platform.identity(browser);
        yield* platform.bindIdentity(identity);
        stage = "binding";
        const binding = yield* platform.binding(browser, target.slug);
        stage = "page";
        const response = yield* platform.page(browser, limit, start);
        stage = "projection";
        const observedAt = yield* platform.observedAt;
        const output = yield* readAttempt(() => projectLinkedInProfileActivityPage({
          response,
          target,
          profileUrn: binding.profileUrn,
          queryId: binding.queryId,
          limit,
          start,
          observedAt,
        }));
        return {
          status: "succeeded" as const,
          output,
          finalUrl: target.activityUrl,
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
        finalUrl: target.activityUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: linkedInProfileActivityDiagnostic(error.cause, stage),
        readFailure: linkedInProfileActivityReadFailure(error.cause, stage),
      });
    }));
  });
}
