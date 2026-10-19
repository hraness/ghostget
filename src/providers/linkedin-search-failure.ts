import { OperationDeadlineError } from "../operation-deadline";
import { permissionReadFailure, readFailureProjection, type ReadFailureProjection } from "../web-session-execution";
import { LinkedInSearchBrowserFailure } from "./linkedin-web-search-browser";

export type LinkedInSearchStage = "navigation" | "page" | "projection";

export function linkedInSearchReadFailure(
  error: unknown,
): ReadFailureProjection {
  const permission = permissionReadFailure(error);
  if (permission !== null) return permission;
  let deadlineCause: unknown = error;
  for (let depth = 0; depth < 8 && deadlineCause !== undefined; depth += 1) {
    if (deadlineCause instanceof OperationDeadlineError) {
      return readFailureProjection(deadlineCause.failure === "timed-out" ? "operation-timeout" : "contract-drift");
    }
    deadlineCause = deadlineCause instanceof Error ? deadlineCause.cause : undefined;
  }
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInSearchBrowserFailure) {
      if (current.category === "authwall" || current.category === "session-cookie") return readFailureProjection("auth-repair-required");
      if (current.category === "startup" || current.category === "execution-context") {
        return readFailureProjection("provider-temporary");
      }
      return readFailureProjection("contract-drift");
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return readFailureProjection("contract-drift");
}

const REQUEST_STAGE: Readonly<Record<LinkedInSearchStage, string>> = {
  navigation: "contained-browser search navigation",
  page: "contained-browser search page projection",
  projection: "exact search projection",
};

export function linkedInSearchDiagnostic(error: unknown, stage: LinkedInSearchStage): string {
  let category = stage === "projection" ? "exact search projection" : "reviewed page projection";
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof LinkedInSearchBrowserFailure) {
      if (current.category === "authwall") category = "signed-out authwall";
      if (current.category === "session-cookie") category = "signed-in session cookie";
      if (current.category === "pager") category = "reviewed pager bound";
      break;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return `LinkedIn search read failed during ${REQUEST_STAGE[stage]} at ${category}; no remote write occurred`;
}
