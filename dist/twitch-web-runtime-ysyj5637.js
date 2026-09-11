// @bun
import {
  createWebSessionClient,
  webSessionAuthSubject,
  webSessionCookie
} from "./index-wn3s7nnj.js";
import {
  failedProviderRead
} from "./index-4smh9n9x.js";
import"./index-j3ysa35f.js";
import"./index-aka7rgdj.js";
import"./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/twitch-web.ts
var TWITCH_APP_ORIGIN = "https://www.twitch.tv";
var TWITCH_GQL_ORIGIN = "https://gql.twitch.tv";
var TWITCH_GQL_PATH = "/gql";
var TWITCH_WEB_OPERATION_NAMES = Object.freeze([
  "profiles.read"
]);
var TWITCH_WEB_OPERATIONS = Object.freeze({
  "profiles.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    reason: "fixed authenticated current-viewer and target-bound About-panel registered queries project one exact follower count without acknowledgement side effects"
  })
});
var TWITCH_WEB_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
var TWITCH_CURRENT_VIEWER_REVISION = "6c870de60372d53089341c8af304c35c541754b72550eb2672224b017a39512e";
var TWITCH_ABOUT_PANEL_REVISION = "3b9cd4edd28e8e6f7ba6152a56157bc2b1c1a8f6e81d70808ad1b85250e5288f";
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function exactGraphQlResult(value, label) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`${label} must be one exact GraphQL batch result`);
  }
  const result = record(value[0], `${label}[0]`);
  if (Object.hasOwn(result, "errors")) {
    throw new Error(`${label} returned GraphQL errors`);
  }
  return record(result.data, `${label}[0].data`);
}
function twitchUserId(value, label) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,31}$/u.test(value)) {
    throw new Error(`${label} must be one exact Twitch user ID`);
  }
  return value;
}
function twitchLogin(value, label = "Twitch login") {
  if (typeof value !== "string" || !/^[a-z0-9_]{4,25}$/u.test(value)) {
    throw new Error(`${label} must be one exact lowercase Twitch login`);
  }
  return value;
}
function exactFollowerCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Twitch follower count must be an exact nonnegative safe integer");
  }
  return value;
}
function persistedQuery(operationName, variables, revision) {
  if (!/^[a-f0-9]{64}$/u.test(revision)) {
    throw new Error(`Twitch ${operationName} revision is not reviewed`);
  }
  return Object.freeze({
    operationName,
    variables,
    extensions: Object.freeze({
      persistedQuery: Object.freeze({ version: 1, sha256Hash: revision })
    })
  });
}
function twitchCurrentViewerRequest() {
  return Object.freeze([
    persistedQuery("TopNav_CurrentUser", Object.freeze({}), TWITCH_CURRENT_VIEWER_REVISION)
  ]);
}
function twitchProfileRequest(requestedLogin) {
  const channelLogin = twitchLogin(requestedLogin, "requested Twitch login");
  return Object.freeze([
    persistedQuery("ChannelRoot_AboutPanel", Object.freeze({ channelLogin, skipSchedule: true }), TWITCH_ABOUT_PANEL_REVISION)
  ]);
}

class TwitchViewerAuthRepairRequiredError extends Error {
  constructor() {
    super("Twitch selected session is not signed in");
    this.name = "TwitchViewerAuthRepairRequiredError";
  }
}
function parseTwitchCurrentViewerResponse(value) {
  const data = exactGraphQlResult(value, "Twitch current-viewer response");
  if (data.currentUser === null) {
    throw new TwitchViewerAuthRepairRequiredError;
  }
  const currentUser = record(data.currentUser, "Twitch current-viewer response[0].data.currentUser");
  return Object.freeze({
    id: twitchUserId(currentUser.id, "Twitch current-viewer response[0].data.currentUser.id")
  });
}

class TwitchProfileTargetUnavailableError extends Error {
  constructor() {
    super("Twitch profile target is unavailable");
    this.name = "TwitchProfileTargetUnavailableError";
  }
}
function parseTwitchProfileResponse(value, requestedLogin, viewer) {
  const login = twitchLogin(requestedLogin, "requested Twitch login");
  const data = exactGraphQlResult(value, "Twitch profile response");
  if (data.user === null)
    throw new TwitchProfileTargetUnavailableError;
  const user = record(data.user, "Twitch profile response[0].data.user");
  const responseId = twitchUserId(user.id, "Twitch profile response[0].data.user.id");
  if (responseId !== viewer.id) {
    throw new Error("Twitch profile response did not bind the current viewer ID");
  }
  const followers = record(user.followers, "Twitch profile response[0].data.user.followers");
  return Object.freeze({
    id: responseId,
    login,
    followers: exactFollowerCount(followers.totalCount)
  });
}
function exactObservedAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("Twitch statistics observedAt must be an exact UTC observation time");
  }
  return value;
}
function projectTwitchProfileStats(profile, observedAt) {
  const login = twitchLogin(profile.login);
  const followers = exactFollowerCount(profile.followers);
  return Object.freeze({
    schemaVersion: 1,
    provider: "twitch",
    target: Object.freeze({
      kind: "profile",
      id: twitchUserId(profile.id, "Twitch profile ID"),
      url: `${TWITCH_APP_ORIGIN}/${login}`
    }),
    observedAt: exactObservedAt(observedAt),
    completeness: "complete",
    metrics: Object.freeze({
      followers: Object.freeze({
        status: "available",
        value: followers,
        precision: "exact",
        unit: "count"
      })
    }),
    metadata: Object.freeze({ login })
  });
}

// src/providers/twitch-web-runtime.ts
var MAX_TWITCH_RESPONSE_BYTES = 256 * 1024;
function exactProfileInput(input) {
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "profile") {
    throw new Error("Twitch profiles.read accepts only input.profile");
  }
  return twitchLogin(input.profile, "input.profile");
}
function twitchAuthToken(client) {
  const token = webSessionCookie(client.cookies, "auth-token");
  if (!/^[A-Za-z0-9._~-]{16,512}$/u.test(token)) {
    throw new Error("Twitch auth-token cookie did not match the reviewed credential shape");
  }
  return token;
}
function twitchHeaders(client, referer) {
  if (!/^[a-z0-9]{20,64}$/u.test(TWITCH_WEB_CLIENT_ID)) {
    throw new Error("Twitch web client ID is not reviewed");
  }
  const token = twitchAuthToken(client);
  return Object.freeze({
    accept: "*/*",
    authorization: `OAuth ${token}`,
    "client-id": TWITCH_WEB_CLIENT_ID,
    "content-type": "text/plain",
    referer
  });
}
async function requestTwitchBatch(client, request, referer, maximumBytes) {
  return client.requestJson({
    url: new URL(TWITCH_GQL_PATH, TWITCH_GQL_ORIGIN),
    method: "POST",
    headers: twitchHeaders(client, referer),
    body: canonicalJson(request),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(maximumBytes, MAX_TWITCH_RESPONSE_BYTES)
  });
}
async function currentViewer(client) {
  return parseTwitchCurrentViewerResponse(await requestTwitchBatch(client, twitchCurrentViewerRequest(), "https://www.twitch.tv/", MAX_TWITCH_RESPONSE_BYTES));
}
function viewerSubject(viewer) {
  return `twitch:${viewer.id}`;
}
function requireBoundViewer(auth, viewer) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null || !/^twitch:[1-9][0-9]{0,31}$/u.test(expected)) {
    throw new Error("Twitch profile statistics require an auth locator bound to the exact viewer subject");
  }
  if (viewerSubject(viewer) !== expected) {
    throw new Error("Twitch browser session viewer no longer matches the confirmed auth subject");
  }
}
function observedAt(dependencies) {
  const now = dependencies?.now?.() ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) {
    throw new Error("Twitch profile observation time is invalid");
  }
  return new Date(now).toISOString();
}
async function probeTwitchWebSubject(auth, options = {}) {
  const client = await createWebSessionClient(TWITCH_GQL_ORIGIN, auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  return viewerSubject(await currentViewer(client));
}
async function executeTwitchWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site !== "twitch" || recipe.action !== "profiles.read" || recipe.contractVersion !== 1 || TWITCH_WEB_OPERATIONS["profiles.read"].state !== "observed") {
    throw new Error("Twitch authenticated profiles.read contract is not installed");
  }
  const profile = exactProfileInput(input);
  options.beforeDispatch;
  options.afterDispatchVerified;
  const finalUrl = `https://www.twitch.tv/${profile}`;
  let stage = "bootstrap";
  try {
    const client = await createWebSessionClient(TWITCH_GQL_ORIGIN, auth, {
      timeoutMs: recipe.timeoutMs,
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
    });
    stage = "identity";
    const viewer = await currentViewer(client);
    requireBoundViewer(auth, viewer);
    stage = "target";
    const response = await requestTwitchBatch(client, twitchProfileRequest(profile), `${finalUrl}/about`, recipe.maxOutputBytes);
    const output = projectTwitchProfileStats(parseTwitchProfileResponse(response, profile, viewer), observedAt(options.dependencies));
    return {
      status: "succeeded",
      output,
      finalUrl: output.target.url,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    return failedProviderRead("Twitch profile", error, finalUrl, {
      stage,
      authenticated: true,
      accountMismatch: (candidate) => candidate.message.includes("no longer matches") || candidate.message.includes("did not bind the current viewer ID"),
      authRepairRequired: (candidate) => candidate.message.includes("auth-token cookie") || candidate.message.includes("auth locator bound") || candidate instanceof TwitchViewerAuthRepairRequiredError,
      targetUnavailable: (candidate) => candidate instanceof TwitchProfileTargetUnavailableError
    });
  }
}
export {
  probeTwitchWebSubject,
  executeTwitchWebOperation
};
