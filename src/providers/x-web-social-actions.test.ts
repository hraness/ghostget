import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { assertAsyncProperty, assertProperty } from "../test-support";
import {
  assertXWebFollowingDesiredState,
  executeXWebFollowSet,
  parseXWebFollowInput,
  parseXWebRepostInput,
  parseXWebFollowingReadback,
  parseXWebFollowMutationResponse,
  xWebFollowRequest,
  xWebRepostVariables,
  type XWebFollowPorts,
} from "./x-web-social-actions";

// Secret-free ordinary-target fixtures, independently checked against public frontend
// main.3999c6d7f4dbb6c7a.js SHA256 a72dc552b4d839940c9ea61da49fb11bc2ae408e72bfea0fc265f1d05841b26d,
// modules 825369 (relationship defaults), 950231 (repost calls), 526882/504153 (descriptors).
const FOLLOW_BODY_123456 = "include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1"
  + "&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_is_blue_verified=1"
  + "&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&user_id=123456";

describe("X exact follow request and readback primitives", () => {
  test("matches frontend response fields and fixed POST routes with exactly one numeric target", () => {
    for (const following of [true, false]) {
      expect(xWebFollowRequest({ user_id: "123456", following })).toEqual({
        method: "POST", origin: "https://x.com", pathname: `/i/api/1.1/friendships/${following ? "create" : "destroy"}.json`,
        contentType: "application/x-www-form-urlencoded", body: FOLLOW_BODY_123456,
      });
    }
    for (const input of [null, [], {}, { user_id: 123, following: true }, { user_id: "x", following: true },
      { user_id: "123&other=456", following: true }, { user_id: "1".repeat(20), following: true },
      { user_id: "123", following: "true" }, { user_id: "123", following: true, url: "https://other.invalid" }]) {
      expect(() => parseXWebFollowInput(input)).toThrow();
    }
  });

  test("requires an exact mutation response target and explicit relationship state", () => {
    expect(parseXWebFollowMutationResponse({ id_str: "123", following: true, follow_request_sent: false }, "123"))
      .toEqual({ userId: "123", following: true, followRequestSent: false });
    for (const value of [{ id_str: "456", following: true }, { id_str: "123" }, { id_str: "123", following: true, errors: [] },
      { id_str: "123", following: true, follow_request_sent: true }, { id_str: "123", following: false, follow_request_sent: "true" }]) {
      expect(() => parseXWebFollowMutationResponse(value, "123")).toThrow();
    }
  });

  test("reads the viewer's following flag rather than the reverse followed_by flag", () => {
    const observed = parseXWebFollowingReadback({ __typename: "User", rest_id: "123", relationship_perspectives: { following: true, followed_by: false } }, "123");
    expect(observed).toEqual({ userId: "123", following: true, followRequestSent: null });
    assertXWebFollowingDesiredState(observed, { user_id: "123", following: true });
    expect(() => assertXWebFollowingDesiredState(observed, { user_id: "123", following: false })).toThrow();
    expect(() => parseXWebFollowingReadback({ rest_id: "123", relationship_perspectives: { followed_by: true } }, "123")).toThrow("following boolean");
  });

  test("supports exact visibility wrappers and compatible legacy state, rejecting drift and disagreement", () => {
    expect(parseXWebFollowingReadback({ __typename: "UserWithVisibilityResults", user: {
      __typename: "User", rest_id: "123", legacy: { following: false, follow_request_sent: false },
    } }, "123")).toEqual({ userId: "123", following: false, followRequestSent: false });
    for (const value of [{ __typename: "UserUnavailable", rest_id: "123" },
      { rest_id: "456", relationship_perspectives: { following: true } },
      { rest_id: "123", relationship_perspectives: { following: true }, legacy: { following: false } },
      { rest_id: "123", relationship_perspectives: { following: false, follow_request_sent: true }, legacy: { follow_request_sent: false } }]) {
      expect(() => parseXWebFollowingReadback(value, "123")).toThrow();
    }
  });

  test("a pending protected-account request never counts as a completed follow or unfollow", () => {
    const pending = parseXWebFollowMutationResponse({ id_str: "123", following: false, follow_request_sent: true }, "123");
    expect(pending.followRequestSent).toBeTrue();
    for (const following of [true, false]) expect(() => assertXWebFollowingDesiredState(pending, { user_id: "123", following })).toThrow("desired state");
  });

  test("property: arbitrary input keys never widen the fixed route authority", () => {
    assertProperty(fc.property(fc.string({ minLength: 1, maxLength: 60 }).filter(key => key !== "user_id" && key !== "following"), key => {
      expect(() => xWebFollowRequest({ user_id: "123", following: true, [key]: "extra" })).toThrow();
    }), { numRuns: 100 });
  });

  test("caller values cannot alter response fields, promoted metadata, routes or headers", () => {
    for (const key of ["include_profile_interstitial_type", "include_blocking", "include_blocked_by", "include_followed_by",
      "include_want_retweets", "include_mute_edge", "include_can_dm", "include_can_media_tag", "include_ext_is_blue_verified",
      "include_ext_verified_type", "include_ext_profile_image_shape", "skip_status", "impression_id", "earned",
      "engagement_metadata", "headers", "method", "pathname", "origin", "screen_name"]) {
      expect(() => xWebFollowRequest({ user_id: "123", following: true, [key]: "0" })).toThrow();
    }
  });

  test("property: follow encoding preserves a bounded decimal identity without numeric conversion", () => {
    assertProperty(fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 19 }), fc.boolean(), (digits, following) => {
      const target = digits.join("");
      const request = xWebFollowRequest({ user_id: target, following });
      const form = new URLSearchParams(request.body);
      expect(form.getAll("user_id")).toEqual([target]);
      expect([...form.keys()]).toHaveLength(13);
      expect([...form.entries()].filter(([key]) => key !== "user_id").every(([, value]) => value === "1")).toBeTrue();
      expect(request.pathname).toBe(`/i/api/1.1/friendships/${following ? "create" : "destroy"}.json`);
      expect(Object.isFrozen(request)).toBeTrue();
    }), { numRuns: 100 });
  });

  test("property: exact identity and desired state bind all accepted relationship observations", () => {
    assertProperty(fc.property(fc.integer({ min: 1, max: 999_999 }), fc.boolean(), (target, following) => {
      const observed = parseXWebFollowingReadback({ rest_id: String(target), relationship_perspectives: { following, followed_by: !following } }, String(target));
      assertXWebFollowingDesiredState(observed, { user_id: String(target), following });
      expect(() => assertXWebFollowingDesiredState(observed, { user_id: String(target + 1), following })).toThrow();
      expect(() => assertXWebFollowingDesiredState(observed, { user_id: String(target), following: !following })).toThrow();
    }), { numRuns: 100 });
  });
});

describe("X exact ordinary-target repost variables", () => {
  test("matches current frontend create and delete variables without historical dark_request", () => {
    const target = "9876543210123456789";
    expect(xWebRepostVariables({ post_id: target, reposted: true })).toEqual({ tweet_id: target });
    expect(xWebRepostVariables({ post_id: target, reposted: false })).toEqual({ source_tweet_id: target });
    const input = { post_id: target, reposted: true };
    const parsed = parseXWebRepostInput(input);
    input.post_id = "123";
    expect(parsed.post_id).toBe(target);
    expect(Object.isFrozen(parsed)).toBeTrue();
    expect(Object.isFrozen(xWebRepostVariables(parsed))).toBeTrue();
  });

  test("rejects mixed shapes, omitted desired state, nonnumeric targets and caller transport metadata", () => {
    for (const input of [null, [], {}, { post_id: "123" }, { post_id: 123, reposted: true },
      { post_id: "", reposted: true }, { post_id: "@example", reposted: true }, { post_id: "123&tweet_id=456", reposted: true },
      { post_id: "1".repeat(20), reposted: true }, { post_id: "123", reposted: "true" },
      { post_id: "123", reposted: true, dark_request: false }, { tweet_id: "123", reposted: true },
      { source_tweet_id: "123", reposted: false }, { post_id: "123", reposted: true, engagement_request: {} },
      { post_id: "123", reposted: true, queryId: "other" }]) {
      expect(() => xWebRepostVariables(input)).toThrow();
    }
  });

  test("property: ordinary reposts preserve exactly one numeric target and the selected variable name", () => {
    assertProperty(fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 19 }), fc.boolean(), (digits, reposted) => {
      const target = digits.join("");
      const variables = xWebRepostVariables({ post_id: target, reposted });
      expect(Object.keys(variables)).toEqual([reposted ? "tweet_id" : "source_tweet_id"]);
      expect(Object.values(variables)).toEqual([target]);
      expect(JSON.parse(JSON.stringify(variables))).toEqual(variables);
      expect(Object.isFrozen(variables)).toBeTrue();
    }), { numRuns: 100 });
  });

  test("property: extra keys never widen the repost variable authority", () => {
    assertProperty(fc.property(fc.string({ minLength: 1, maxLength: 60 }).filter(key => key !== "post_id" && key !== "reposted"), fc.boolean(), (key, reposted) => {
      expect(() => xWebRepostVariables({ post_id: "123", reposted, [key]: "extra" })).toThrow();
    }), { numRuns: 100 });
  });
});

describe("X follow production lifecycle", () => {
  function state(following: boolean, rest_id = "123", requested = false) {
    return { rest_id, relationship_perspectives: { following, follow_request_sent: requested } };
  }
  test("follow and unfollow each admit one exact target mutation and independently read the desired state", async () => {
    for (const following of [true, false]) {
      const events: string[] = []; let reads = 0;
      const execution = await executeXWebFollowSet({ user_id: "123", following }, {
        requireViewer: async () => { events.push("viewer"); return "456"; },
        readTarget: async id => { expect(id).toBe("123"); events.push("read"); return state(reads++ === 0 ? !following : following); },
        mutate: async (request, admit) => {
          expect(request.pathname).toBe(`/i/api/1.1/friendships/${following ? "create" : "destroy"}.json`);
          expect(request.body).toBe(FOLLOW_BODY_123456.replace("user_id=123456", "user_id=123")); events.push("mutation-ready"); await admit();
          return { id_str: "123", following, follow_request_sent: false };
        },
      }, { beforeDispatch: async event => { events.push("admit"); expect(event.progress).toEqual({ planned: 1, started: 0, verified: 0 }); },
        afterDispatchVerified: async event => { events.push("verified"); expect(event.progress).toEqual({ planned: 1, started: 1, verified: 1 }); } });
      expect(execution).toMatchObject({ status: "succeeded", dispatch: { planned: 1, started: 1, verified: 1 } });
      expect(events).toEqual(["viewer", "read", "mutation-ready", "viewer", "admit", "read", "viewer", "verified"]);
    }
  });
  test("already satisfied states and pending follow requests never dispatch", async () => {
    for (const following of [true, false]) {
      let mutations = 0;
      const ports: XWebFollowPorts = { requireViewer: async () => "456", readTarget: async () => state(following),
        mutate: async () => { mutations++; throw new Error("must not mutate"); } };
      expect(await executeXWebFollowSet({ user_id: "123", following }, ports))
        .toMatchObject({ status: "succeeded", noOp: true, dispatchStarted: false });
      expect(mutations).toBe(0);
    }
    let mutations = 0;
    expect(await executeXWebFollowSet({ user_id: "123", following: true }, {
      requireViewer: async () => "456", readTarget: async () => state(false, "123", true),
      mutate: async () => { mutations++; throw new Error("must not mutate"); },
    })).toMatchObject({ status: "failed", dispatchStarted: false });
    expect(mutations).toBe(0);
  });
  test("rejects switched actor, switched target, missing or contradictory pre-read state and denied admission without effects", async () => {
    for (const failure of ["actor", "target", "missing", "contradiction", "self", "admission"] as const) {
      let actors = 0; let effects = 0;
      const result = await executeXWebFollowSet({ user_id: "123", following: true }, {
        requireViewer: async () => failure === "self" ? "123" : failure === "actor" && actors++ > 0 ? "789" : "456",
        readTarget: async () => failure === "missing" ? { rest_id: "123" }
          : failure === "contradiction" ? { ...state(false), legacy: { following: true } } : state(false, failure === "target" ? "789" : "123"),
        mutate: async (_, admit) => { await admit(); effects++; return { id_str: "123", following: true }; },
      }, { beforeDispatch: async () => { if (failure === "admission") throw new Error("denied"); } });
      expect(result).toMatchObject({ status: "failed", dispatchStarted: false, dispatch: { started: 0, verified: 0 } });
      expect(effects).toBe(0);
    }
  });
  test("a changed, missing, pending or failed post-dispatch observation is uncertain and never retried", async () => {
    for (const failure of ["mutation", "mutation-target", "mutation-state", "target", "state", "pending", "actor", "read"] as const) {
      let actors = 0; let reads = 0; let mutations = 0; let verified = 0;
      const result = await executeXWebFollowSet({ user_id: "123", following: true }, {
        requireViewer: async () => failure === "actor" && actors++ > 1 ? "789" : "456",
        readTarget: async () => { if (reads++ === 0) return state(false);
          if (failure === "read") throw new Error("private provider error");
          return state(failure !== "state" && failure !== "pending", failure === "target" ? "789" : "123", failure === "pending"); },
        mutate: async (_, admit) => { await admit(); mutations++;
          if (failure === "mutation") throw new Error("private ambiguous provider error");
          return { id_str: failure === "mutation-target" ? "789" : "123", following: failure !== "mutation-state" }; },
      }, { afterDispatchVerified: async () => { verified++; } });
      expect(result).toMatchObject({ status: "indeterminate", dispatchStarted: true, dispatch: { started: 1, verified: 0 } });
      expect(mutations).toBe(1); expect(verified).toBe(0);
      expect(JSON.stringify(result)).not.toContain("private");
    }
  });
  test("repeated or concurrent admission cannot record a second durable dispatch", async () => {
    for (const concurrent of [false, true]) {
      let confirmations = 0; let effects = 0; let reads = 0;
      const result = await executeXWebFollowSet({ user_id: "123", following: true }, {
        requireViewer: async () => "456", readTarget: async () => state(reads++ > 0),
        mutate: async (_, admit) => {
          if (concurrent) {
            const admissions = await Promise.allSettled([admit(), admit()]);
            expect(admissions.map(value => value.status).sort()).toEqual(["fulfilled", "rejected"]);
          } else {
            await admit();
            await expect(admit()).rejects.toThrow("cannot be repeated");
          }
          effects++;
          return { id_str: "123", following: true, follow_request_sent: false };
        },
      }, { beforeDispatch: async () => { confirmations++; } });
      expect(confirmations).toBe(1); expect(effects).toBe(1);
      expect(result).toMatchObject({ status: "succeeded", dispatch: { started: 1, verified: 1 } });
    }
  });

  test("property: bounded admission and readback fault schedules never replay a relationship effect", async () => {
    await assertAsyncProperty(fc.asyncProperty(fc.integer({ min: 0, max: 4 }), fc.boolean(), fc.boolean(), fc.boolean(),
      async (admissions, denied, readbackFault, following) => {
        let confirmations = 0; let effects = 0; let reads = 0;
        const result = await executeXWebFollowSet({ user_id: "123", following }, {
          requireViewer: async () => "456",
          readTarget: async () => {
            if (reads++ === 0) return state(!following);
            if (readbackFault) throw new Error("private readback fault");
            return state(following);
          },
          mutate: async (_, admit) => {
            // A transport may effect only after its admission resolves. A rejected
            // admission stops the bounded schedule; the lifecycle itself never retries.
            for (let index = 0; index < admissions; index++) { await admit(); effects++; }
            return { id_str: "123", following, follow_request_sent: false };
          },
        }, { beforeDispatch: async () => { confirmations++; if (denied) throw new Error("denied"); } });
        const submitted = admissions > 0 && !denied;
        expect(confirmations).toBe(admissions > 0 ? 1 : 0);
        expect(effects).toBe(submitted ? 1 : 0);
        expect(result.dispatchStarted).toBe(submitted);
        expect(result.dispatch?.started).toBe(submitted ? 1 : 0);
        expect(result.status).toBe(!submitted ? "failed" : admissions === 1 && !readbackFault ? "succeeded" : "indeterminate");
        expect(JSON.stringify(result)).not.toContain("private");
      }), { numRuns: 100 });
  });

});
