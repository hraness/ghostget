import { APP_HOST_MAX_FRAME_BYTES, APP_HOST_PROTOCOL, type AppHostFrame } from "./app-host-protocol";
import { digest, identifier, invalid, keys, nullable, oneOf, record, string } from "./control/validation";

export function parseAppHostFrame(line: string): AppHostFrame {
  if (Buffer.byteLength(line) > APP_HOST_MAX_FRAME_BYTES) invalid();
  const value = record(JSON.parse(line));
  keys(value, ["protocol", "id", "request"]);
  if (value.protocol !== APP_HOST_PROTOCOL) invalid();
  const id = identifier(value.id);
  const request = record(value.request);
  const action = request.action;
  const frame = { protocol: APP_HOST_PROTOCOL, id };
  if (action === "hello" || action === "accounts.list" || action === "browsers.list" || action === "close") {
    keys(request, ["action"]);
    return { ...frame, request: { action } };
  }
  if (action === "connection.begin") {
    keys(request, ["action", "browser", "profile", "id", "expectedRevision"]);
    const browser = oneOf(request.browser, ["chrome", "safari"]);
    const profile = nullable(request.profile, 128);
    if (browser === "safari" && profile !== null) invalid();
    if (browser === "chrome" && (profile === null || !/^(?:Default|Profile [1-9][0-9]{0,2})$/u.test(profile))) invalid();
    const accountId = request.id === null ? null : identifier(request.id);
    if (accountId !== null && !/^[a-z][a-z0-9-]{0,47}$/u.test(accountId)) invalid();
    const expectedRevision = request.expectedRevision === null ? null : digest(request.expectedRevision);
    if ((accountId === null) !== (expectedRevision === null)) invalid();
    return { ...frame, request: { action, browser, profile, id: accountId, expectedRevision } };
  }
  if (action === "connection.verify" || action === "connection.cancel") {
    keys(request, ["action", "attemptId"]);
    return { ...frame, request: { action, attemptId: identifier(request.attemptId) } };
  }
  if (action === "connection.commit") {
    keys(request, ["action", "attemptId", "expectedSubject", "expectedDigest"]);
    const expectedSubject = string(request.expectedSubject, 19);
    if (!/^[0-9]{1,19}$/u.test(expectedSubject)) invalid();
    return { ...frame, request: { action, attemptId: identifier(request.attemptId), expectedSubject, expectedDigest: digest(request.expectedDigest) } };
  }
  if (action === "connection.disconnect") {
    keys(request, ["action", "id", "expectedRevision", "expectedDigest"]);
    return { ...frame, request: { action, id: identifier(request.id), expectedRevision: digest(request.expectedRevision), expectedDigest: digest(request.expectedDigest) } };
  }
  return invalid();
}
