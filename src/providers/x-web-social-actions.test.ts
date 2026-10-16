import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { assertProperty } from "../test-support";
import {
  assertXWebFollowingDesiredState,
  executeXWebFollowSet,
  parseXWebFollowInput,
  parseXWebFollowingReadback,
  parseXWebFollowMutationResponse,
  xWebFollowRequest,
  type XWebFollowPorts,
} from "./x-web-social-actions";

describe("X exact follow request and readback primitives", () => {
  test("describes fixed POST routes with exactly one numeric target and no caller transport input", () => {
    for (const following of [true, false]) {
      expect(xWebFollowRequest({ user_id: "123456", following })).toEqual({
        method: "POST", origin: "https://x.com", pathname: `/i/api/1.1/friendships/${following ? "create" : "destroy"}.json`,
        contentType: "application/x-www-form-urlencoded", body: "user_id=123456",
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

  test("property: exact identity and desired state bind all accepted relationship observations", () => {
    assertProperty(fc.property(fc.integer({ min: 1, max: 999_999 }), fc.boolean(), (target, following) => {
      const observed = parseXWebFollowingReadback({ rest_id: String(target), relationship_perspectives: { following, followed_by: !following } }, String(target));
      assertXWebFollowingDesiredState(observed, { user_id: String(target), following });
      expect(() => assertXWebFollowingDesiredState(observed, { user_id: String(target + 1), following })).toThrow();
      expect(() => assertXWebFollowingDesiredState(observed, { user_id: String(target), following: !following })).toThrow();
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
          expect(request.body).toBe("user_id=123"); events.push("mutation-ready"); await admit();
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
});
