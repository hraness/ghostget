import { APP_HOST_X_ACTIONS, APP_HOST_X_FEEDS, type AppHostXIntent, type AppHostXRequest } from "./app-host-x-protocol";
import { digest, identifier, integer, invalid, keys, nullable, oneOf, record, string, strings } from "./control/validation";

function postId(value: unknown): string {
  const result = string(value, 19);
  if (!/^[0-9]{1,19}$/u.test(result)) invalid();
  return result;
}
function profile(value: unknown): string | null {
  if (value === null) return null;
  const result = string(value, 20);
  if (!/^(?:@?[a-zA-Z0-9_]{1,15}|[0-9]{1,19})$/u.test(result)) invalid();
  return result;
}
export function parseAppHostXIntent(value: unknown): AppHostXIntent {
  const input = record(value);
  const action = oneOf(input.action, APP_HOST_X_ACTIONS);
  const fields = action === "post" ? ["text", "media"]
    : action === "reply" || action === "quote" ? ["text", "postId", "media"]
    : action === "delete" ? ["postId", "expectedText"]
    : action === "follow" || action === "unfollow" ? ["subject"] : ["postId"];
  if (Object.keys(input).some(key => key !== "action" && !fields.includes(key))) invalid();
  if (action === "post" || action === "reply" || action === "quote") {
    const text = string(input.text, 25_000, 0);
    const media = input.media === undefined ? [] : strings(input.media, 4, 128).map(identifier);
    if (text.trim().length === 0 && media.length === 0) invalid();
    return { action, text, media, ...(action === "post" ? {} : { postId: postId(input.postId) }) };
  }
  if (action === "follow" || action === "unfollow") return { action, subject: postId(input.subject) };
  if (action === "delete") return { action, postId: postId(input.postId), ...(input.expectedText === undefined ? {} : { expectedText: string(input.expectedText, 25_000, 0) }) };
  return { action, postId: postId(input.postId) };
}

/** Closed semantic surface; no URLs, provider operation names or approval booleans. */
export function parseAppHostXRequest(value: unknown): AppHostXRequest {
  const input = record(value);
  const action = input.action;
  const binding = { accountId: identifier(input.accountId), expectedAccountRevision: digest(input.expectedAccountRevision) };
  const exact = (...fields: string[]): void => keys(input, ["action", "accountId", "expectedAccountRevision", ...fields]);
  if (action === "x.capabilities") { exact(); return { action, ...binding }; }
  if (action === "x.profile.get") { exact("profile"); return { action, ...binding, profile: profile(input.profile) }; }
  if (action === "x.post.get") { exact("postId"); return { action, ...binding, postId: postId(input.postId) }; }
  if (action === "x.feed.list") {
    exact("source", "profile", "cursor", "limit");
    return { action, ...binding, source: oneOf(input.source, APP_HOST_X_FEEDS), profile: profile(input.profile), cursor: nullable(input.cursor, 4096), limit: integer(input.limit, 1, 50) };
  }
  if (action === "x.explore.list") {
    exact("source", "target", "cursor", "limit");
    return { action, ...binding, source: oneOf(input.source, ["trending", "today-news"]), target: nullable(input.target, 4096), cursor: nullable(input.cursor, 4096), limit: integer(input.limit, 1, 50) };
  }
  if (action === "x.notifications.list") {
    exact("cursor", "limit");
    return { action, ...binding, cursor: nullable(input.cursor, 4096), limit: integer(input.limit, 1, 50) };
  }
  if (action === "x.media.prepare") {
    exact("files");
    if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 4) invalid();
    const files = input.files.map(item => {
      const file = record(item);
      if (Object.keys(file).some(key => !["path", "mediaType", "altText"].includes(key))) invalid();
      const path = string(file.path, 4096);
      if (!path.startsWith("/") || /[\r\n\t]/u.test(path)) invalid();
      const mediaType = oneOf(file.mediaType, ["image/png", "image/jpeg", "video/mp4"]);
      const altText = file.altText === undefined ? null : nullable(file.altText, 1000);
      return { path, mediaType, altText };
    });
    if (new Set(files.map(file => file.path)).size !== files.length || files.some(file => file.mediaType === "video/mp4") && files.length !== 1) invalid();
    return { action, ...binding, files };
  }
  if (action === "x.action.prepare") { exact("intent"); return { action, ...binding, intent: parseAppHostXIntent(input.intent) }; }
  if (action === "x.action.commit") { exact("preparationId", "digest"); return { action, ...binding, preparationId: identifier(input.preparationId), digest: digest(input.digest) }; }
  if (action === "x.action.cancel") { exact("preparationId"); return { action, ...binding, preparationId: identifier(input.preparationId) }; }
  if (action === "x.action.status") { exact("runId"); return { action, ...binding, runId: identifier(input.runId) }; }
  return invalid();
}
