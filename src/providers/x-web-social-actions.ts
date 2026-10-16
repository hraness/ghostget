import { hasExactKeys } from "../contracts-shape";
import type { WebSessionDispatchEvent, WebSessionExecution } from "../web-session-execution";

export type XWebFollowInput = Readonly<{ user_id: string; following: boolean }>;
export type XWebRepostInput = Readonly<{ post_id: string; reposted: boolean }>;
export type XWebFollowingState = Readonly<{ userId: string; following: boolean; followRequestSent: boolean | null }>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function numericTarget(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9]{1,19}$/u.test(value)) throw new Error(`${label} must be one exact numeric ID`);
  return value;
}

function userId(value: unknown): string {
  return numericTarget(value, "X follow target");
}

export function parseXWebFollowInput(value: unknown): XWebFollowInput {
  const input = record(value, "X follow input");
  if (!hasExactKeys(input, ["user_id", "following"]) || typeof input.following !== "boolean") {
    throw new Error("X follow input requires only user_id and following");
  }
  return Object.freeze({ user_id: userId(input.user_id), following: input.following });
}

// Frontend main.3999c6d7f4dbb6c7a.js, module 825369: these are fixed
// response-projection fields for an ordinary numeric-target relationship change.
const FOLLOW_RESPONSE_FIELDS = Object.freeze({
  include_profile_interstitial_type: "1",
  include_blocking: "1",
  include_blocked_by: "1",
  include_followed_by: "1",
  include_want_retweets: "1",
  include_mute_edge: "1",
  include_can_dm: "1",
  include_can_media_tag: "1",
  include_ext_is_blue_verified: "1",
  include_ext_verified_type: "1",
  include_ext_profile_image_shape: "1",
  skip_status: "1",
});

/** Pure request description. This is not evidence that the route is currently observed. */
export function xWebFollowRequest(value: unknown): Readonly<{
  method: "POST";
  origin: "https://x.com";
  pathname: "/i/api/1.1/friendships/create.json" | "/i/api/1.1/friendships/destroy.json";
  contentType: "application/x-www-form-urlencoded";
  body: string;
}> {
  const input = parseXWebFollowInput(value);
  return Object.freeze({ method: "POST", origin: "https://x.com",
    pathname: input.following ? "/i/api/1.1/friendships/create.json" : "/i/api/1.1/friendships/destroy.json",
    contentType: "application/x-www-form-urlencoded", body: new URLSearchParams({ ...FOLLOW_RESPONSE_FIELDS, user_id: input.user_id }).toString() });
}

export function parseXWebRepostInput(value: unknown): XWebRepostInput {
  const input = record(value, "X repost input");
  if (!hasExactKeys(input, ["post_id", "reposted"]) || typeof input.reposted !== "boolean") {
    throw new Error("X repost input requires only post_id and reposted");
  }
  return Object.freeze({ post_id: numericTarget(input.post_id, "X repost target"), reposted: input.reposted });
}

/** Ordinary-target variables only; promoted engagement metadata has separate authority. */
export function xWebRepostVariables(value: unknown): Readonly<{ tweet_id: string } | { source_tweet_id: string }> {
  const input = parseXWebRepostInput(value);
  // Frontend main.3999c6d7f4dbb6c7a.js, module 950231. Neither route
  // includes the historical dark_request field. This does not activate a route.
  return input.reposted ? Object.freeze({ tweet_id: input.post_id }) : Object.freeze({ source_tweet_id: input.post_id });
}

function flag(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function state(id: unknown, following: unknown, requested: unknown, expectedUserId: string): XWebFollowingState {
  const target = userId(id);
  if (target !== userId(expectedUserId)) throw new Error("X follow readback changed the exact target");
  if (typeof following !== "boolean") throw new Error("X follow readback omitted its exact following boolean");
  const followRequestSent = flag(requested, "X follow request state");
  if (following && followRequestSent === true) throw new Error("X follow readback contained contradictory relationship state");
  return Object.freeze({ userId: target, following, followRequestSent });
}

/** Parse only a target-bound friendship mutation response; callers still need an independent read. */
export function parseXWebFollowMutationResponse(value: unknown, expectedUserId: string): XWebFollowingState {
  const response = record(value, "X friendship response");
  if (response.errors !== undefined || response.error !== undefined) throw new Error("X friendship response contains a provider error");
  return state(response.id_str, response.following, response.follow_request_sent, expectedUserId);
}

/** Accept the user-result subtree from the separately reviewed UserByRestId read. */
export function parseXWebFollowingReadback(value: unknown, expectedUserId: string): XWebFollowingState {
  let result = record(value, "X follow user readback");
  if (result.__typename === "UserWithVisibilityResults") result = record(result.user, "X follow user readback.user");
  if (result.__typename !== undefined && result.__typename !== "User") throw new Error("X follow target is unavailable");
  const perspectives = result.relationship_perspectives === undefined ? null : record(result.relationship_perspectives, "X relationship perspectives");
  const legacy = result.legacy === undefined ? null : record(result.legacy, "X legacy relationship");
  const modernFollowing = flag(perspectives?.following, "X viewer following state");
  const legacyFollowing = flag(legacy?.following, "X legacy following state");
  const modernRequested = flag(perspectives?.follow_request_sent, "X viewer follow request state");
  const legacyRequested = flag(legacy?.follow_request_sent, "X legacy follow request state");
  if ((modernFollowing !== null && legacyFollowing !== null && modernFollowing !== legacyFollowing)
    || (modernRequested !== null && legacyRequested !== null && modernRequested !== legacyRequested)) {
    throw new Error("X follow readback disagreed across relationship fields");
  }
  return state(result.rest_id, modernFollowing ?? legacyFollowing, modernRequested ?? legacyRequested, expectedUserId);
}

/** Pending protected-account requests never masquerade as a completed follow. */
export function assertXWebFollowingDesiredState(observed: XWebFollowingState, expectedValue: unknown): void {
  const expected = parseXWebFollowInput(expectedValue);
  if (observed.userId !== expected.user_id || observed.following !== expected.following
    || observed.followRequestSent === true) throw new Error("X independent follow readback did not match the confirmed desired state");
}

export type XWebFollowPorts = Readonly<{
  requireViewer: () => Promise<string>;
  readTarget: (userId: string) => Promise<unknown>;
  /** Invoke admission only after the fixed request and transaction ID are ready. Never replay it. */
  mutate: (request: ReturnType<typeof xWebFollowRequest>, admit: () => Promise<void>) => Promise<unknown>;
}>;

/** Shared production lifecycle; provider transport remains descriptor-bound in x-web-runtime. */
export async function executeXWebFollowSet(inputValue: unknown, ports: XWebFollowPorts, callbacks: Readonly<{
  beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
  afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
}> = {}): Promise<WebSessionExecution> {
  const input = parseXWebFollowInput(inputValue);
  let started = 0;
  let verified = 0;
  let admissionAttempted = false;
  const finalUrl = `https://x.com/i/user/${input.user_id}`;
  const event = (start: number, complete: number): WebSessionDispatchEvent => ({ id: "relationships.follow.set", index: 1,
    progress: { planned: 1, started: start, verified: complete } });
  try {
    const actor = userId(await ports.requireViewer());
    if (actor === input.user_id) throw new Error("X cannot follow the current viewer");
    const initial = parseXWebFollowingReadback(await ports.readTarget(input.user_id), input.user_id);
    if (initial.following === input.following && initial.followRequestSent !== true) {
      if (userId(await ports.requireViewer()) !== actor) throw new Error("X follow actor changed during readback");
      return { status: "succeeded", output: { effect: "already-satisfied", userId: input.user_id, following: input.following },
        finalUrl, noOp: true, dispatchStarted: false, dispatch: { planned: 1, started: 0, verified: 0 } };
    }
    // Reissuing a follow while a protected-account request is pending is not a new confirmed action.
    if (input.following && initial.followRequestSent === true) throw new Error("X follow request is already pending");
    const response = await ports.mutate(xWebFollowRequest(input), async () => {
      if (admissionAttempted) throw new Error("X follow dispatch admission cannot be repeated");
      admissionAttempted = true;
      if (userId(await ports.requireViewer()) !== actor) throw new Error("X follow actor changed before dispatch");
      await callbacks.beforeDispatch?.(event(0, 0));
      started = 1;
    });
    if (started !== 1) throw new Error("X follow transport escaped dispatch admission");
    assertXWebFollowingDesiredState(parseXWebFollowMutationResponse(response, input.user_id), input);
    assertXWebFollowingDesiredState(parseXWebFollowingReadback(await ports.readTarget(input.user_id), input.user_id), input);
    if (userId(await ports.requireViewer()) !== actor) throw new Error("X follow actor changed during readback");
    verified = 1;
    await callbacks.afterDispatchVerified?.(event(1, 1));
    return { status: "succeeded", output: { userId: input.user_id, following: input.following }, finalUrl,
      dispatchStarted: true, dispatch: { planned: 1, started, verified } };
  } catch {
    return { status: started > 0 ? "indeterminate" : "failed", output: null, finalUrl, dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified }, error: started > 0
        ? "X may have changed this relationship but exact readback was not verified; reconcile before retrying"
        : "X relationship change failed before submission" };
  }
}
