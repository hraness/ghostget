import { expect, test } from "bun:test";
import { Cause, Effect, Exit, Option } from "effect";
import { ReadEffectFailure } from "../read-effect";
import { assertProperty, fc } from "../test-support";
import type { WebSessionClient } from "../web-session-client";
import { WebSessionResponseRejectedError } from "../web-session-read-errors";
import { LinkedInCompanyPlatformLive, type LinkedInCompanyNative } from "./linkedin-company-platform";
import { linkedInCompanyReadProgram } from "./linkedin-company-program";
import { linkedInProfileIdentityAllowsBrowserFallback, linkedInProfileReadFailure } from "./linkedin-read-failure";

const target = { slug: "fixture-company", url: "https://www.linkedin.com/company/fixture-company/" };
const unexpected = (): Promise<never> => Promise.reject(new Error("unexpected company read port"));
const direct: WebSessionClient = {
  origin: "https://www.linkedin.com",
  cookies: [],
  requestText: unexpected,
  requestJson: unexpected,
  requestJsonResponse: unexpected,
  requestStatus: unexpected,
};

test("diagnostic text never grants company retry or fallback authority", () => {
  assertProperty(fc.property(fc.string({ maxLength: 512 }), fc.constantFrom(302, 401, 403, 429, 500), (detail, status) => {
    const spoof = new Error(`authenticated web API returned unreviewed status/content type ${status}/text/html${detail}`);
    expect(linkedInProfileIdentityAllowsBrowserFallback(spoof)).toBeFalse();
    expect(linkedInProfileReadFailure(spoof)).toEqual({ category: "contract-drift", retryDisposition: "do-not-retry" });
    const typed = new WebSessionResponseRejectedError(detail, status, "text/html");
    expect(linkedInProfileIdentityAllowsBrowserFallback(typed)).toBe([302, 401, 403].includes(status));
  }));
});

test.each(["native", "message"] as const)(
  "company program takes identity fallback only with %s evidence",
  async (evidence) => {
    const events: string[] = [];
    const rejection = evidence === "native"
      ? new WebSessionResponseRejectedError("unrelated private detail", 401, "text/html")
      : new Error("authenticated web API returned unreviewed status/content type 401/text/html");
    const ports: LinkedInCompanyNative = {
      openDirect: () => { events.push("direct"); return Promise.resolve(direct); },
      directIdentity: () => { events.push("direct-identity"); return Promise.reject(rejection); },
      openBrowser: () => {
        events.push("browser");
        return Promise.resolve({
          currentIdentityResponse: () => { events.push("browser-identity"); return Promise.reject(new Error("private identity failure")); },
          readProfileHtml: unexpected,
          readConnectionsHtml: unexpected,
          readContactInfoJson: unexpected,
                    readContactNavigationText: () => Promise.reject(new Error("crossed Contact-info navigation")),
                    readContactOverlayText: unexpected,
          readOrganizationHtml: unexpected,
          close: () => { events.push("close"); return Promise.resolve(); },
        });
      },
      decodeIdentity: () => ({ subject: "urn:li:fsd_profile:123" }),
      bindIdentity: identity => identity.subject,
      readCompany: unexpected,
      observedAt: () => "2026-09-06T00:00:00.000Z",
    };
    const result = await Effect.runPromise(linkedInCompanyReadProgram(target, false, () => "safe failure").pipe(
      Effect.provide(LinkedInCompanyPlatformLive(ports)),
    ));
    expect(events).toEqual(evidence === "native"
      ? ["direct", "direct-identity", "browser", "browser-identity", "close"]
      : ["direct", "direct-identity"]);
    expect(result).toEqual({
      status: "failed", output: null, finalUrl: target.url, dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }, error: "safe failure",
      readFailure: { category: "contract-drift", retryDisposition: "do-not-retry" },
    });
  },
);

test.each(["success", "failure"] as const)(
  "company program waits for native close %s and retains the original failure privately",
  async (closeOutcome) => {
    const primary = new Error("private company identity detail");
    const cleanup = new Error("private company close detail");
    const closeStarted = Promise.withResolvers<void>();
    const closeSettlement = Promise.withResolvers<void>();
    const events: string[] = [];
    const program = linkedInCompanyReadProgram(target, true, () => {
      events.push("diagnostic");
      return "safe identity failure";
    }).pipe(Effect.provide(LinkedInCompanyPlatformLive({
      openBrowser: () => Promise.resolve({
        currentIdentityResponse: () => Promise.reject(primary),
        readProfileHtml: unexpected,
        readConnectionsHtml: unexpected,
        readContactInfoJson: unexpected,
                readContactNavigationText: () => Promise.reject(new Error("crossed Contact-info navigation")),
                readContactOverlayText: unexpected,
        readOrganizationHtml: unexpected,
        close: () => { events.push("close"); closeStarted.resolve(); return closeSettlement.promise; },
      }),
      openDirect: unexpected,
      directIdentity: unexpected,
      decodeIdentity: () => ({ subject: "urn:li:fsd_profile:123" }),
      bindIdentity: identity => identity.subject,
      readCompany: unexpected,
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
