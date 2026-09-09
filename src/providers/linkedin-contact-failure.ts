import { OperationDeadlineError } from "../operation-deadline";
import { readFailureProjection, type ReadFailureProjection } from "../web-session-execution";
import {
  LinkedInProfileBrowserFailure,
  LinkedInProfileBrowserResponseRejectedError,
} from "./linkedin-web-profile-browser";

export type LinkedInContactStage = "identity" | "profile" | "contact" | "projection";

/** Only the account-binding producer creates this category. Native wording is
 * diagnostic data and cannot authorize account mismatch or auth repair. */
export class LinkedInContactIdentityMismatch extends Error {
  constructor(cause: unknown) {
    super("LinkedIn current member no longer matches the bound auth subject", { cause });
    this.name = "LinkedInContactIdentityMismatch";
  }
}

export function linkedInContactReadFailure(
  error: unknown,
  stage: LinkedInContactStage,
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
    if (current instanceof LinkedInContactIdentityMismatch) return readFailureProjection("account-mismatch");
    if (current instanceof LinkedInProfileBrowserResponseRejectedError) {
      if (current.status === 401 || current.status === 403) return readFailureProjection("auth-repair-required");
      if (current.status === 429) return readFailureProjection("provider-throttled");
      if (current.status === 302 || current.status === 408 || current.status >= 500) {
        return readFailureProjection("provider-temporary");
      }
      if (current.status === 404 && stage !== "identity") return readFailureProjection("target-unavailable");
      return readFailureProjection("contract-drift");
    }
    if (current instanceof LinkedInProfileBrowserFailure) {
      if (current.category === "authwall" || current.category === "session-cookie") {
        return readFailureProjection("auth-repair-required");
      }
      if (
        current.category === "startup"
        || current.category === "execution-context"
        || current.category === "provider-fetch"
      ) {
        return readFailureProjection("provider-temporary");
      }
      return readFailureProjection("contract-drift");
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return readFailureProjection("contract-drift");
}

const REQUEST_STAGE: Readonly<Record<LinkedInContactStage, string>> = {
  identity: "contained-browser signed-in identity preflight",
  profile: "contained-browser 1st-degree profile binding",
  contact: "contained-browser Contact-info read",
  projection: "exact Contact-info projection",
};

export function linkedInContactDiagnostic(error: unknown, stage: LinkedInContactStage): string {
  let category = stage === "profile" ? "1st-degree relationship binding"
    : stage === "projection" ? "exact Contact-info projection" : "reviewed response projection";
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInContactIdentityMismatch) {
      category = "signed-in account binding";
      break;
    }
    if (current instanceof LinkedInProfileBrowserFailure) {
      if (current.category === "authwall") category = "signed-out authwall";
      if (current.category === "session-cookie") category = "signed-in session cookie";
      break;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return `LinkedIn contacts.read failed during ${REQUEST_STAGE[stage]} at ${category}; no remote write occurred`;
}
