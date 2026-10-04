import { describe, expect, test } from "bun:test";

import type { GhostgetAuth } from "../auth";
import type { BrowserSession, CreateBrowserSessionOptions } from "../browser";
import {
  createLinkedInSearchBrowserTransport,
  LinkedInSearchBrowserFailure,
} from "./linkedin-web-search-browser";
import { linkedInSearchTarget } from "./linkedin-web-search";

const auth = {
  schemaVersion: 1,
  id: "linkedin-search-browser-test",
  kind: "browser-profile",
  profile: "Persistent LinkedIn",
  trustUnfilteredEgress: true,
  subject: "urn:li:fsd_profile:123456789",
} as const satisfies GhostgetAuth;

const target = linkedInSearchTarget("release engineering notes");

function evalRecord(result: unknown, origin = "https://www.linkedin.com/search/results/content/?keywords=release%20engineering%20notes") {
  return { success: true, result: { origin, result } };
}

function currentUrlRecord(url: string) {
  return { success: true, result: { url } };
}

function snapshotRecord(cards: readonly unknown[] = [], nextPageRequest = false) {
  return evalRecord({ cards, searchId: null, nextPageRequest });
}

function createTransport(session: BrowserSession) {
  return createLinkedInSearchBrowserTransport(auth, {
    timeoutMs: 10_000,
    maxOutputBytes: 1_048_576,
    dependencies: {
      createBrowserSession: (
        _manifest: unknown,
        _auth: GhostgetAuth,
        options: CreateBrowserSessionOptions,
      ) => {
        expect(options.allowCodeOwnedEvaluation).toBeTrue();
        return Promise.resolve(session);
      },
    },
  });
}

describe("LinkedIn content-search browser transport", () => {
  test("navigates the exact bound search URL and snapshots cards", async () => {
    const commands: (readonly (readonly string[])[])[] = [];
    const session: BrowserSession = {
      runBatch: (batch) => {
        commands.push(batch);
        const command = batch[0];
        if (command?.[0] === "eval" && command[1]?.includes("location.href=input.searchUrl")) {
          return Promise.resolve([evalRecord({ navigated: true })]);
        }
        if (command?.[0] === "eval" && command[1]?.includes("scrollIntoView")) {
          return Promise.resolve([evalRecord({ advanced: true, items: 2 })]);
        }
        if (command?.[0] === "eval" && command[1]?.includes("querySelectorAll")) {
          return Promise.resolve([snapshotRecord([{ activityUrn: "urn:li:activity:7511429088998297600" }], true)]);
        }
        if (command?.[0] === "get" && command[1] === "url") {
          return Promise.resolve([currentUrlRecord(target.searchUrl)]);
        }
        return Promise.resolve([{ success: true, result: null }]);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createTransport(session);
    try {
      const first = await transport.openSearch(target);
      expect(first).toMatchObject({ nextPageRequest: true });
      const second = await transport.advancePager();
      expect(second).toMatchObject({ nextPageRequest: true });
    } finally {
      await transport.close();
    }
    for (const batch of commands) {
      for (const command of batch) {
        if (command[0] !== "eval") continue;
        expect(() => new Function(command[1] ?? "")).not.toThrow();
      }
    }
    const cardEvals = commands.flat().filter((command) =>
      command[0] === "eval" && command[1]?.includes("searchParams.get(\"keywords\")"));
    expect(cardEvals.length).toBeGreaterThanOrEqual(2);
    for (const evalSource of cardEvals) {
      expect(evalSource[1]).toContain("release engineering notes");
    }
    expect(commands.some((batch) => batch.some((command) => command[0] === "wait")))
      .toBeTrue();
  });

  test("fails closed when the bound page redirects to an authwall", async () => {
    const session: BrowserSession = {
      runBatch: (batch) => {
        const command = batch[0];
        if (command?.[0] === "eval" && command[1]?.includes("location.href")) {
          return Promise.resolve([evalRecord({ navigated: true })]);
        }
        if (command?.[0] === "get") {
          return Promise.resolve([currentUrlRecord("https://www.linkedin.com/uas/login?session_redirect=%2Fsearch")]);
        }
        return Promise.resolve([{ success: true, result: null }]);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createTransport(session);
    try {
      try {
        await transport.openSearch(target);
        throw new Error("expected authwall failure");
      } catch (error) {
        expect(error).toBeInstanceOf(LinkedInSearchBrowserFailure);
        expect((error as LinkedInSearchBrowserFailure).category).toBe("authwall");
      }
    } finally {
      await transport.close();
    }
  });

  test("fails closed when the bound page loses the exact query", async () => {
    const session: BrowserSession = {
      runBatch: (batch) => {
        const command = batch[0];
        if (command?.[0] === "eval" && command[1]?.includes("location.href")) {
          return Promise.resolve([evalRecord({ navigated: true })]);
        }
        if (command?.[0] === "get") {
          return Promise.resolve([currentUrlRecord(
            "https://www.linkedin.com/search/results/content/?keywords=other%20query",
          )]);
        }
        return Promise.resolve([{ success: true, result: null }]);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createTransport(session);
    try {
      await expect(transport.openSearch(target)).rejects.toThrow(
        "LinkedIn search browser left its exact target page",
      );
    } finally {
      await transport.close();
    }
  });

  test("refuses pager advances before navigation binds the query", async () => {
    const session: BrowserSession = {
      runBatch: () => Promise.resolve([{ success: true, result: null }]),
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createTransport(session);
    try {
      await expect(transport.advancePager()).rejects.toThrow(
        "LinkedIn search browser pager is out of order",
      );
    } finally {
      await transport.close();
    }
  });

  test("rejects a malformed snapshot envelope", async () => {
    const session: BrowserSession = {
      runBatch: (batch) => {
        const command = batch[0];
        if (command?.[0] === "eval" && command[1]?.includes("location.href")) {
          return Promise.resolve([evalRecord({ navigated: true })]);
        }
        if (command?.[0] === "eval") {
          return Promise.resolve([evalRecord({ cards: [], unexpected: true })]);
        }
        if (command?.[0] === "get") {
          return Promise.resolve([currentUrlRecord(target.searchUrl)]);
        }
        return Promise.resolve([{ success: true, result: null }]);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createTransport(session);
    try {
      await expect(transport.openSearch(target)).rejects.toThrow(
        "LinkedIn search snapshot returned an unexpected result shape",
      );
    } finally {
      await transport.close();
    }
  });
});
