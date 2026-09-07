import { OperationDeadlineError } from "../operation-deadline";
import { readFailureProjection, type ReadFailureProjection } from "../web-session-execution";
import {
  LinkedInFeedBrowserFailure,
  LinkedInFeedBrowserResponseRejectedError,
} from "./linkedin-web-feed-browser";

export type LinkedInProfileActivityStage = "identity" | "binding" | "page" | "projection";

/** Only the account-binding producer creates this category. Native wording is
 * diagnostic data and cannot authorize account mismatch or auth repair. */
export class LinkedInProfileActivityIdentityMismatch extends Error {
  constructor(cause: unknown) {
    super("LinkedIn current member no longer matches the bound auth subject", { cause });
    this.name = "LinkedInProfileActivityIdentityMismatch";
  }
}

export function linkedInProfileActivityReadFailure(
  error: unknown,
  stage: LinkedInProfileActivityStage,
): ReadFailureProjection {
  let deadlineCause: unknown = error;
  for (let depth = 0; depth < 8 && deadlineCause !== undefined; depth += 1) {
    if (deadlineCause instanceof OperationDeadlineError) {
      return readFailureProjection(deadlineCause.failure === "timed-out" ? "operation-timeout" : "contract-drift");
    }
    deadlineCause = deadlineCause instanceof Error ? deadlineCause.cause : undefined;
  }
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInProfileActivityIdentityMismatch) return readFailureProjection("account-mismatch");
    if (current instanceof LinkedInFeedBrowserResponseRejectedError) {
      if (current.status === 401 || current.status === 403) return readFailureProjection("auth-repair-required");
      if (current.status === 429) return readFailureProjection("provider-throttled");
      if (current.status === 302 || current.status === 408 || current.status >= 500) return readFailureProjection("provider-temporary");
      if (current.status === 404 && stage !== "identity") return readFailureProjection("target-unavailable");
      return readFailureProjection("contract-drift");
    }
    if (current instanceof LinkedInFeedBrowserFailure) {
      if (current.category === "authwall" || current.category === "session-cookie") return readFailureProjection("auth-repair-required");
      if (current.category === "startup" || current.category === "execution-context" || current.category === "provider-fetch") {
        return readFailureProjection("provider-temporary");
      }
      return readFailureProjection("contract-drift");
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return readFailureProjection("contract-drift");
}

const REQUEST_STAGE: Readonly<Record<LinkedInProfileActivityStage, string>> = {
  identity: "contained-browser signed-in identity preflight",
  binding: "contained-browser profile-activity query observation",
  page: "contained-browser profile-activity page read",
  projection: "exact profile-activity projection",
};

export function linkedInProfileActivityDiagnostic(error: unknown, stage: LinkedInProfileActivityStage): string {
  let category = stage === "binding" ? "live query observation"
    : stage === "projection" ? "exact page projection" : "reviewed response projection";
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInProfileActivityIdentityMismatch) {
      category = "signed-in account binding";
      break;
    }
    if (current instanceof LinkedInFeedBrowserFailure) {
      if (current.category === "authwall") category = "signed-out authwall";
      if (current.category === "session-cookie") category = "signed-in session cookie";
      break;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return `LinkedIn profile-activity read failed during ${REQUEST_STAGE[stage]} at ${category}; no remote write occurred`;
}
