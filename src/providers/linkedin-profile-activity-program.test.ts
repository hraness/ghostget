import { expect, test } from "bun:test";
import { Cause, Effect, Exit, Fiber, Option } from "effect";
import { ReadEffectFailure } from "../read-effect";
import { assertProperty, fc } from "../test-support";
import {
  linkedInProfileActivityDiagnostic,
  linkedInProfileActivityReadFailure,
} from "./linkedin-profile-activity-failure";
import { LinkedInProfileActivityPlatformLive, type LinkedInProfileActivityNative } from "./linkedin-profile-activity-platform";
import { linkedInProfileActivityReadProgram } from "./linkedin-profile-activity-program";
import { LinkedInFeedBrowserFailure, type LinkedInFeedBrowserTransport } from "./linkedin-web-feed-browser";

const target = {
  slug: "fixture-person",
  profileUrl: "https://www.linkedin.com/in/fixture-person/",
  activityUrl: "https://www.linkedin.com/in/fixture-person/recent-activity/all/",
};
const unexpected = (): Promise<never> => Promise.reject(new Error("unexpected activity port"));

function program(openBrowser: LinkedInProfileActivityNative["openBrowser"]) {
  return linkedInProfileActivityReadProgram(target, 0, 10).pipe(Effect.provide(LinkedInProfileActivityPlatformLive({
    openBrowser,
    decodeIdentity: () => ({ subject: "urn:li:fsd_profile:123" }),
    bindIdentity: identity => identity.subject,
    observedAt: () => "2026-09-07T00:00:00.000Z",
  })));
}

test("profile-activity diagnostic wording cannot select account or auth authority", () => {
  assertProperty(fc.property(fc.string({ maxLength: 512 }), fc.constantFrom("authwall", "session-cookie", "startup", "provider-fetch"), (detail, category) => {
    const spoof = new Error(`current member no longer matches; cookie session signed-out authwall ${detail}`);
    expect(linkedInProfileActivityReadFailure(spoof, "identity")).toEqual({ category: "contract-drift", retryDisposition: "do-not-retry" });
    expect(linkedInProfileActivityDiagnostic(spoof, "identity")).toBe("LinkedIn profile-activity read failed during contained-browser signed-in identity preflight at reviewed response projection; no remote write occurred");
    const typed = new LinkedInFeedBrowserFailure(category, detail);
    expect(linkedInProfileActivityReadFailure(typed, "identity").category).toBe(
      category === "authwall" || category === "session-cookie" ? "auth-repair-required" : "provider-temporary",
    );
  }));
});

test.each([undefined, null, false, new Error("private close detail")])(
  "profile-activity close selects the native rejection and retains the earlier Cause (%j)",
  async (cleanup) => {
    const primary = new Error("private page failure");
    const closeStarted = Promise.withResolvers<void>();
    const closing = Promise.withResolvers<void>();
    let settled = false;
    const running = Effect.runPromiseExit(program(() => Promise.resolve({
      currentIdentityResponse: () => Promise.reject(primary),
      resolveProfileActivityBinding: unexpected,
      readProfileActivityPage: unexpected,
      close: () => { closeStarted.resolve(); return closing.promise; },
    }))).then(exit => { settled = true; return exit; });
    await closeStarted.promise;
    try {
      expect(settled).toBeFalse();
    } finally {
      closing.reject(cleanup);
    }
    const exit = await running;
    expect(Exit.isFailure(exit)).toBeTrue();
    if (!Exit.isFailure(exit)) return;
    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBeTrue();
    if (Option.isNone(failure)) return;
    expect(failure.value.cause).toBe(cleanup);
    expect(Cause.isCause(failure.value.primaryCause)).toBeTrue();
    if (!Cause.isCause(failure.value.primaryCause)) return;
    const previous = Cause.failureOption(failure.value.primaryCause);
    expect(Option.isSome(previous)).toBeTrue();
    if (Option.isNone(previous)) return;
    expect(previous.value).toBeInstanceOf(ReadEffectFailure);
    if (previous.value instanceof ReadEffectFailure) expect(previous.value.cause).toBe(primary);
  },
);

test.each(["acquire", "identity"] as const)(
  "profile-activity interruption joins held native %s and then native close",
  async (heldBoundary) => {
    const started = Promise.withResolvers<void>();
    const acquisition = Promise.withResolvers<LinkedInFeedBrowserTransport>();
    const identity = Promise.withResolvers<unknown>();
    const closeStarted = Promise.withResolvers<void>();
    const closing = Promise.withResolvers<void>();
    const events: string[] = [];
    const browser: LinkedInFeedBrowserTransport = {
      currentIdentityResponse: () => { events.push("identity"); started.resolve(); return identity.promise; },
      resolveProfileActivityBinding: unexpected,
      readProfileActivityPage: unexpected,
      close: () => { events.push("close"); closeStarted.resolve(); return closing.promise; },
    };
    const fiber = Effect.runFork(program(() => {
      events.push("acquire");
      if (heldBoundary === "acquire") { started.resolve(); return acquisition.promise; }
      return Promise.resolve(browser);
    }));
    await started.promise;
    let interrupted = false;
    const stopping = Effect.runPromise(Fiber.interrupt(fiber)).then(exit => { interrupted = true; return exit; });
    try {
      expect(interrupted).toBeFalse();
      expect(events).toEqual(heldBoundary === "acquire" ? ["acquire"] : ["acquire", "identity"]);
      acquisition.resolve(browser);
      identity.resolve({});
      await closeStarted.promise;
      expect(interrupted).toBeFalse();
      closing.resolve();
      const exit = await stopping;
      expect(Exit.isFailure(exit)).toBeTrue();
      if (Exit.isFailure(exit)) expect(Cause.isInterrupted(exit.cause)).toBeTrue();
      expect(events.filter(event => event === "close")).toHaveLength(1);
    } finally {
      acquisition.resolve(browser);
      identity.resolve({});
      closing.resolve();
      await stopping;
    }
  },
);
