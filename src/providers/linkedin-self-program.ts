import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { PreservedBrowserArtifactsError } from "../browser";
import { OperationDeadlineError } from "../operation-deadline";
import { readAttempt, type ReadEffectFailure, withReadResource } from "../read-effect";
import {
  readFailureProjection,
  type ReadFailureProjection,
  type WebSessionExecution
} from "../web-session-execution";
import {
  WebSessionAuthStateError,
  WebSessionReadTransportError,
  WebSessionResponseRejectedError
} from "../web-session-read-errors";
import { LinkedInSelfPlatform, type LinkedInSelfIdentity } from "./linkedin-self-platform";
import { projectLinkedInPersonalProfileStats, type LinkedInProfileTarget } from "./linkedin-web";
import {
  LinkedInProfileBrowserFailure,
  LinkedInProfileBrowserResponseRejectedError
} from "./linkedin-web-profile-browser";

/** Typed provider metadata owns authority/retry decisions. Message text is never
 * accepted as evidence for a session switch, account mismatch or retry. */
export function linkedInSelfReadFailure(error: unknown): ReadFailureProjection {
  let current = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (current instanceof OperationDeadlineError) return readFailureProjection(current.failure === "timed-out" ? "operation-timeout" : "contract-drift");
    current = current.cause;
  }
  current = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if (current instanceof LinkedInProfileBrowserResponseRejectedError
      || current instanceof WebSessionResponseRejectedError) {
      const status = current.status;
      return readFailureProjection(status === 401 || status === 403
        ? "auth-repair-required"
        : status === 429
          ? "provider-throttled"
          : status === 302 || status === 408 || status >= 500 ? "provider-temporary" : "contract-drift");
    }
    if (current instanceof WebSessionAuthStateError) return readFailureProjection("auth-repair-required");
    if (current instanceof WebSessionReadTransportError) return readFailureProjection("provider-temporary");
    if (current instanceof LinkedInProfileBrowserFailure) return readFailureProjection(current.category === "authwall" || current.category === "session-cookie"
      ? "auth-repair-required"
      : current.category === "startup" || current.category === "execution-context"
        || current.category === "provider-fetch"
        ? "provider-temporary"
        : "contract-drift");
    current = current.cause;
  }
  return readFailureProjection("contract-drift");
}

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
      if (cause instanceof WebSessionResponseRejectedError && [302, 401, 403].includes(cause.status)
        && /^(?:missing|[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+)$/u.test(cause.contentType ?? "missing")
        && (cause.contentType ?? "missing").length <= 128) {
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
