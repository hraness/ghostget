import * as Effect from "effect/Effect";
import { PreservedBrowserArtifactsError } from "../browser";
import { readAttempt, type ReadEffectFailure, withReadResource } from "../read-effect";
import type { WebSessionExecution } from "../web-session-execution";
import { LinkedInSearchPlatform } from "./linkedin-search-platform";
import {
  linkedInSearchDiagnostic,
  linkedInSearchReadFailure,
  type LinkedInSearchStage,
} from "./linkedin-search-failure";
import {
  linkedInSearchSnapshot,
  projectLinkedInSearchPage,
  type LinkedInSearchSnapshot,
  type LinkedInSearchTarget,
} from "./linkedin-web-search";

const SEARCH_MAX_PAGER_ADVANCES = 12;

function uniqueCardCount(snapshots: readonly LinkedInSearchSnapshot[]): number {
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    for (const card of snapshot.cards) {
      if (card.activityUrn !== null) seen.add(card.activityUrn);
    }
  }
  return seen.size;
}

export function linkedInSearchReadProgram(
  target: LinkedInSearchTarget,
  emitted: number,
  limit: number,
): Effect.Effect<WebSessionExecution, ReadEffectFailure, LinkedInSearchPlatform> {
  return Effect.gen(function*() {
    const platform = yield* LinkedInSearchPlatform;
    let stage: LinkedInSearchStage = "navigation";
    let closeFailed = false;
    return yield* withReadResource(
      platform.openBrowser,
      browser => Effect.gen(function*() {
        const first = yield* platform.page(browser, target);
        const snapshots: LinkedInSearchSnapshot[] = [yield* readAttempt(() => linkedInSearchSnapshot(first))];
        stage = "page";
        let pagerExhausted = false;
        while (snapshots.length <= SEARCH_MAX_PAGER_ADVANCES) {
          const last = snapshots[snapshots.length - 1]!;
          if (!last.nextPageRequest) break;
          const prior = uniqueCardCount(snapshots);
          if (prior >= emitted + limit) break;
          const advance = yield* platform.advance(browser);
          const next = yield* readAttempt(() => linkedInSearchSnapshot(advance));
          snapshots.push(next);
          if (uniqueCardCount(snapshots) === prior) {
            pagerExhausted = true;
            break;
          }
        }
        stage = "projection";
        const observedAt = yield* platform.observedAt;
        const output = yield* readAttempt(() => projectLinkedInSearchPage({
          snapshots: Object.freeze(snapshots),
          target,
          emitted,
          limit,
          observedAt,
          pagerExhausted,
        }));
        return {
          status: "succeeded" as const,
          output,
          finalUrl: target.searchUrl,
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
        finalUrl: target.searchUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
        error: linkedInSearchDiagnostic(error.cause, stage),
        readFailure: linkedInSearchReadFailure(error.cause),
      });
    }));
  });
}
