import { expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import { assertXWebUserFeedTargetBound } from "./x-web";

const digit = fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");
const snowflakeId = fc.array(digit, { minLength: 1, maxLength: 19 }).map((digits) => digits.join(""));

function userTweetsResponse(result: Readonly<Record<string, unknown>>): unknown {
  return { data: { user: { result } } };
}

test("UserTweets Relay and snowflake identities round-trip to the requested user", () => {
  assertProperty(fc.property(snowflakeId, (userId) => {
    const relayId = Buffer.from(`User:${userId}`, "utf8").toString("base64");
    assertXWebUserFeedTargetBound(userTweetsResponse({
      __typename: "User",
      rest_id: userId,
    }), userId);
    assertXWebUserFeedTargetBound(userTweetsResponse({
      __typename: "User",
      id: relayId,
    }), userId);
    assertXWebUserFeedTargetBound(userTweetsResponse({
      __typename: "User",
      id: `User:${userId}`,
    }), userId);
    assertXWebUserFeedTargetBound(userTweetsResponse({
      __typename: "User",
      legacy: { id_str: userId },
    }), userId);
    expect(() => assertXWebUserFeedTargetBound(userTweetsResponse({
      __typename: "User",
      id: relayId,
    }), userId === "0" ? "1" : "0")).toThrow("did not bind the requested user");
  }));
});
