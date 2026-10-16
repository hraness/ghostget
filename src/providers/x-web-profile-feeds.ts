import { assertXWebContactsTargetBound, projectXWebFeedPage, type XWebFeedPage } from "./x-web";

export type XWebProfileFeedSource = "profile-replies" | "profile-highlights";
export type XWebProfileFeedReadRequest = {
  readonly operationId: "feeds.user-replies" | "feeds.user-highlights";
  readonly operationName: "UserRepliesTimeline" | "UserHighlightsTweets";
  readonly method: "GET";
  readonly variables: Readonly<{
    userId: string;
    count: number;
    includePromotedContent: true;
    withVoice: boolean;
    withCommunity?: boolean;
    cursor?: string;
  }>;
};

function route(source: XWebProfileFeedSource) {
  if (source === "profile-replies") return { operationId: "feeds.user-replies", operationName: "UserRepliesTimeline" } as const;
  if (source === "profile-highlights") return { operationId: "feeds.user-highlights", operationName: "UserHighlightsTweets" } as const;
  throw new Error("X profile feed source is unsupported");
}
function target(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]{1,19}$/u.test(value)) throw new Error("X profile feed target must be an exact numeric ID");
  return value;
}
function pageLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) throw new Error("X profile feed limit must be an integer between 1 and 50");
  return value;
}
function continuation(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("X profile feed cursor must be bounded provider data");
  }
  return value;
}

/** Fixed routes and variables observed in the current profile source and capture. */
export function buildXWebProfileFeedReadRequest(
  source: XWebProfileFeedSource,
  targetId: string,
  limit: number,
  cursor: string | null,
  flags: { readonly withVoice: boolean; readonly withCommunity: boolean },
): XWebProfileFeedReadRequest {
  const selected = route(source);
  const userId = target(targetId), count = pageLimit(limit), next = continuation(cursor);
  if (typeof flags !== "object" || flags === null || Array.isArray(flags)
    || Object.keys(flags).length !== 2 || !Object.hasOwn(flags, "withVoice") || !Object.hasOwn(flags, "withCommunity")
    || typeof flags.withVoice !== "boolean" || typeof flags.withCommunity !== "boolean") {
    throw new Error("X profile feed flags must be the exact reviewed booleans");
  }
  return Object.freeze({ ...selected, method: "GET", variables: Object.freeze({
    userId, count, includePromotedContent: true, withVoice: flags.withVoice,
    ...(source === "profile-replies" ? { withCommunity: flags.withCommunity } : {}),
    ...(next === null ? {} : { cursor: next }),
  }) });
}

/**
 * The generated userId binds this collection. Echoed User identities must agree;
 * conversation parents and highlighted posts may have other authors, so their
 * authors never stand in for the collection's target identity.
 */
export function projectXWebProfileFeedReadPage(
  response: unknown,
  targetId: string,
  source: XWebProfileFeedSource,
  limit: number,
): XWebFeedPage {
  const selected = route(source);
  const userId = target(targetId);
  pageLimit(limit);
  assertXWebContactsTargetBound(response, userId);
  return projectXWebFeedPage(selected.operationId, response, limit);
}
