import { describe, expect, test } from "bun:test";

import { webmcpPlugin } from "./plugin";
import {
  executeWebmcpAuthenticatedOperation,
  probeWebmcpSubject,
} from "../../providers/webmcp-runtime";

const binding = webmcpPlugin.bindings[0];
if (binding?.transport !== "web-session-api") {
  throw new Error("WebMCP web-session binding is unavailable");
}

describe("WebMCP Registry provider plugin", () => {
  test("advertises the three public registry operations", () => {
    expect(webmcpPlugin).toMatchObject({
      id: "webmcp",
      version: "1.0.0",
      sourceKind: "built-in",
    });
    expect(binding).toMatchObject({
      surfaceId: "webmcp",
      origin: "https://www.wmcp.ai",
      manifestOrigins: ["https://www.wmcp.ai", "https://wmcp.ai"],
      protectedHostnameFamilies: ["wmcp.ai", "www.wmcp.ai"],
      authKinds: ["browser-profile"],
    });
    expect(
      binding.operations.map((operation) => operation.name).sort(),
    ).toEqual(["sites.get", "sites.search", "tools.call"]);
    for (const operation of binding.operations) {
      expect(operation).toMatchObject({
        access: "public",
        contractVersion: 1,
        risk: "R1",
        state: "observed",
        dispatch: "none",
      });
    }
    expect(binding.executePublic).toBeFunction();
  });

  test("keeps authenticated hooks inert", async () => {
    await expect(probeWebmcpSubject({
      schemaVersion: 1,
      id: "unused",
      kind: "browser-profile",
      profile: "unused",
      trustUnfilteredEgress: true,
    })).rejects.toThrow("do not use an auth realm");
    await expect(executeWebmcpAuthenticatedOperation())
      .rejects.toThrow("no installed authenticated web operations");
  });
});
