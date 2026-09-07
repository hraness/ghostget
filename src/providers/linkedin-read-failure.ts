import { OperationDeadlineError } from "../operation-deadline";
import { readFailureProjection, type ReadFailureProjection } from "../web-session-execution";
import {
  WebSessionAuthStateError,
  WebSessionReadTransportError,
  WebSessionResponseRejectedError
} from "../web-session-read-errors";
import {
  LinkedInProfileBrowserFailure,
  LinkedInProfileBrowserResponseRejectedError
} from "./linkedin-web-profile-browser";

/** Typed provider metadata owns authority/retry decisions. Message text is never
 * accepted as evidence for a session switch, account mismatch or retry. */
export function linkedInProfileReadFailure(error: unknown): ReadFailureProjection {
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


/** Only a rejected native identity response can authorize the reviewed fallback. */
export function linkedInProfileIdentityAllowsBrowserFallback(cause: unknown): boolean {
  return cause instanceof WebSessionResponseRejectedError
    && [302, 401, 403].includes(cause.status)
    && /^(?:missing|[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+)$/u.test(cause.contentType ?? "missing")
    && (cause.contentType ?? "missing").length <= 128;
}
