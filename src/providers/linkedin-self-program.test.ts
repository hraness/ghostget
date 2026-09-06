import { expect, test } from "bun:test";
import { Cause, Effect, Exit, Option } from "effect";
import { linkedInSelfReadFailure, linkedInSelfReadProgram } from "./linkedin-self-program";
import { WebSessionReadTransportError, WebSessionResponseRejectedError } from "../web-session-read-errors";
import { ReadEffectFailure } from "../read-effect";
import { LinkedInSelfPlatformLive } from "./linkedin-self-platform";

test("untrusted diagnostic strings cannot grant retry or authentication classifications", () => {
  for (const message of ["authenticated web response body stream failed before completion", "authenticated web API returned unreviewed status/content type 401/text/html", "LinkedIn current member no longer matches", "private cookie session error"]) {
    expect(linkedInSelfReadFailure(new Error(message))).toEqual({ category: "contract-drift", retryDisposition: "do-not-retry" });
  }
  expect(linkedInSelfReadFailure(new WebSessionReadTransportError("private transport detail", null))).toEqual({ category: "provider-temporary", retryDisposition: "retry-once-after-60s" });
  expect(linkedInSelfReadFailure(new WebSessionResponseRejectedError("private response detail", 401, "text/html"))).toEqual({ category: "auth-repair-required", retryDisposition: "repair-auth" });
});

test.each(["success", "failure"] as const)(
  "personal read waits for native close %s before selecting its terminal outcome",
  async (closeOutcome) => {
    const primary = new Error("private identity reader detail");
    const cleanup = new Error("private native close detail");
    const closeStarted = Promise.withResolvers<void>();
    const closeSettlement = Promise.withResolvers<void>();
    const events: string[] = [];
    const unexpected = (): Promise<never> => Promise.reject(new Error("unexpected page or direct read"));
    const browser = {
      currentIdentityResponse: () => Promise.reject(primary),
      readProfileHtml: unexpected,
      readConnectionsHtml: unexpected,
      readOrganizationHtml: unexpected,
      close: () => {
        events.push("close");
        closeStarted.resolve();
        return closeSettlement.promise;
      },
    };
    const program = linkedInSelfReadProgram(
      { slug: "fixture", url: "https://www.linkedin.com/in/fixture/" },
      false,
      true,
      () => { events.push("diagnostic"); return "safe identity failure"; },
    ).pipe(Effect.provide(LinkedInSelfPlatformLive({
      openBrowser: () => Promise.resolve(browser),
      openDirect: unexpected,
      directIdentity: unexpected,
      decodeIdentity: () => ({ subject: "urn:li:fsd_profile:fixture", publicIdentifier: "fixture" }),
      bindIdentity: (identity) => identity.subject,
      readProfile: unexpected,
      readConnections: unexpected,
      observedAt: () => "2026-09-06T00:00:00.000Z",
    })));
    const running = Effect.runPromiseExit(program);
    await closeStarted.promise;
    try {
      expect(events).toEqual(["close"]);
    } finally {
      if (closeOutcome === "success") closeSettlement.resolve();
      else closeSettlement.reject(cleanup);
    }
    const exit = await running;
    if (closeOutcome === "success") {
      expect(events).toEqual(["close", "diagnostic"]);
      expect(Exit.isSuccess(exit)).toBeTrue();
      if (Exit.isSuccess(exit)) {
        expect(exit.value).toMatchObject({ status: "failed", output: null, error: "safe identity failure" });
        expect(JSON.stringify(exit.value)).not.toContain("private");
      }
    } else {
      expect(events).toEqual(["close"]);
      expect(Exit.isFailure(exit)).toBeTrue();
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        expect(Option.isSome(failure)).toBeTrue();
        if (Option.isSome(failure)) {
          expect(failure.value.cause).toBe(cleanup);
          expect(Cause.isCause(failure.value.primaryCause)).toBeTrue();
          if (Cause.isCause(failure.value.primaryCause)) {
            const original = Cause.failureOption(failure.value.primaryCause);
            expect(Option.isSome(original)).toBeTrue();
            if (Option.isSome(original)) {
              expect(original.value).toBeInstanceOf(ReadEffectFailure);
              if (original.value instanceof ReadEffectFailure) expect(original.value.cause).toBe(primary);
            }
          }
        }
      }
    }
  },
);
