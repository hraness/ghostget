import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { GhostgetAuth } from "../auth";
import {
  PreservedBrowserArtifactsError,
  type BrowserSession,
  type CreateBrowserSessionOptions,
} from "../browser";
import { OperationDeadline, type OperationDeadlineClock } from "../operation-deadline";
import { withReadCleanupAdmission } from "../read-admission-runtime";
import { listWebSessionCleanupAdmissions } from "../web-session-cleanup-admission";
import { runWebSessionReadWithDeadline } from "../web-session-read-runtime";
import {
  WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS,
  WebSessionCleanupUnverifiedError,
  type WebSessionExecution,
} from "../web-session-execution";
import { executeLinkedInWebOperation } from "./linkedin-web-runtime";
import {
  LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID,
  buildLinkedInContactNavigationBody,
  buildLinkedInProfileContactDetailsNavigationPostPath,
  buildLinkedInProfileContactInfoGraphqlPath,
  buildLinkedInProfileContactInfoOverlayPath,
} from "./linkedin-web-contact";
import {
  createLinkedInProfileBrowserTransport,
  LinkedInProfileBrowserFailure,
  LinkedInProfileBrowserResponseRejectedError,
} from "./linkedin-web-profile-browser";

const MEMBER_ID = "123456789";
const PROFILE_URL = "https://www.linkedin.com/in/0thernet/";
const ORGANIZATION_URL = "https://www.linkedin.com/company/hraness/";

const auth = {
  schemaVersion: 1,
  id: "linkedin-profile-browser-test",
  kind: "browser-profile",
  profile: "Persistent LinkedIn",
  browserExecutable: "/Applications/Chromium.app/Contents/MacOS/Chromium",
  trustUnfilteredEgress: true,
  subject: `urn:li:fsd_profile:${MEMBER_ID}`,
} as const satisfies GhostgetAuth;

const cookieSourceAuth = {
  schemaVersion: 1,
  id: "linkedin-profile-cookie-source-test",
  kind: "cookie-source",
  source: "chrome",
  profile: "Profile 9",
  subject: `urn:li:fsd_profile:${MEMBER_ID}`,
} as const satisfies GhostgetAuth;

type BrowserReadBinding = {
  readonly kind: "html" | "json" | "rsc" | "rsc-action";
  readonly maxBytes: number;
  readonly path: string;
  readonly referrer: string;
  readonly body?: string;
};

const evaluatorSyntax = new Bun.Transpiler({ loader: "js" });

function requestBinding(source: string): BrowserReadBinding {
  expect(() => evaluatorSyntax.transformSync(source)).not.toThrow();
  expect(source).toContain('redirect:"error"');
  expect(source).toContain('crypto.subtle.digest("SHA-256",body)');
  const prefix = "const input=";
  const start = source.indexOf(prefix);
  if (start === -1 || source[start + prefix.length] !== "{") {
    throw new Error("test browser evaluation omitted its fixed request binding");
  }
  const jsonStart = start + prefix.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) break;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(jsonStart, index + 1)) as BrowserReadBinding;
      }
    }
  }
  throw new Error("test browser evaluation omitted its fixed request binding");
}

function browserBodyRecord(
  body: string,
  contentType: string,
  options: {
    readonly authWall?: boolean;
    readonly bodyBase64?: string;
    readonly bodyBytes?: number;
    readonly bodySha256?: string;
    readonly origin?: string;
    readonly status?: number;
  } = {},
): Readonly<Record<string, unknown>> {
  const authWall = options.authWall ?? false;
  const bytes = Buffer.from(body, "utf8");
  return {
    success: true,
    result: {
      origin: options.origin ?? "https://www.linkedin.com/feed/",
      result: {
        authWall,
        bodyBase64: authWall
          ? null
          : options.bodyBase64 ?? bytes.toString("base64"),
        bodyBytes: authWall ? 0 : options.bodyBytes ?? bytes.byteLength,
        bodySha256: authWall
          ? null
          : options.bodySha256
            ?? createHash("sha256").update(bytes).digest("hex"),
        contentType,
        status: options.status ?? 200,
      },
    },
  };
}

function browserRejectionRecord(
  status: number,
  contentType: string,
): Readonly<Record<string, unknown>> {
  return {
    success: true,
    result: {
      origin: "https://www.linkedin.com/feed/",
      result: {
        authWall: false,
        bodyBase64: null,
        bodyBytes: 0,
        bodySha256: null,
        contentType,
        status,
      },
    },
  };
}

function identityResponse(): string {
  return JSON.stringify({
    data: {
      plainId: MEMBER_ID,
      "*miniProfile": "urn:li:fs_miniProfile:profile-fixture",
    },
    included: [{
      entityUrn: "urn:li:fs_miniProfile:profile-fixture",
      objectUrn: `urn:li:member:${MEMBER_ID}`,
      publicIdentifier: "0thernet",
    }],
  });
}

describe("LinkedIn profile stats contained-browser transport", () => {
  test.each([
    ["within-join", "profiles.read"],
    ["after-join-timeout", "profiles.read"],
    ["within-join", "organizations.read"],
    ["after-join-timeout", "organizations.read"],
  ] as const)(
    "R1 native close acknowledgement loss preserves cleanup custody %s for %s",
    async (proofTiming, action) => {
      const root = mkdtempSync(join(tmpdir(), "wrench-linkedin-cleanup-join-"));
      chmodSync(root, 0o700);
      const environment = { GHOSTGET_STATE_HOME: join(root, "state"), HOME: root };
      const proof = Promise.withResolvers<void>();
      const cleanupStarted = Promise.withResolvers<void>();
      const joinScheduled = Promise.withResolvers<() => void>();
      const caller = new AbortController();
      const timers = new Set<() => void>();
      const clock: OperationDeadlineClock = {
        now: () => 0,
        schedule: (callback, delayMs) => {
          timers.add(callback);
          if (delayMs === WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS) {
            joinScheduled.resolve(callback);
          }
          return () => { timers.delete(callback); };
        },
      };
      const recipe = {
        site: "linkedin",
        action,
        contractVersion: 1,
        timeoutMs: 1_000,
        maxOutputBytes: 2 * 1024 * 1024,
      } as const;
      const targetPath = action === "profiles.read" ? "/in/0thernet/" : "/company/hraness/";
      const events: string[] = [];
      const barriers: Promise<void>[] = [];
      // The existing native BrowserSession seam exposes proof settlement.
      // browser.test.ts separately proves that cleanup cannot fulfill without
      // exact owner/session/endpoint/root observations and journalled removal.
      const session: BrowserSession = {
        runBatch: (commands) => {
          const command = commands[0];
          if (command?.[0] !== "eval" || command[1] === undefined) {
            throw new Error("unexpected LinkedIn cleanup-join command");
          }
          const binding = requestBinding(command[1]);
          events.push(binding.path);
          if (binding.path === "/voyager/api/me") {
            return Promise.resolve([browserBodyRecord(identityResponse(), "application/json")]);
          }
          if (binding.path === "/in/0thernet/") {
            return Promise.resolve([browserBodyRecord(
              '<a href="/mynetwork/network-manager/people-follow/followers"><span>7,553</span> followers</a>',
              "text/html",
            )]);
          }
          if (binding.path === "/company/hraness/") {
            return Promise.resolve([browserBodyRecord(`<code style="display: none" id="bpr-guid-123">${JSON.stringify({
              included: [
                { $type: "com.linkedin.voyager.dash.organization.Company", entityUrn: "urn:li:fsd_company:123", universalName: "hraness", "*followingState": "urn:li:fsd_followingState:company-123", name: "Fixture Company" },
                { $type: "com.linkedin.voyager.dash.feed.FollowingState", entityUrn: "urn:li:fsd_followingState:company-123", followerCount: 6 },
              ],
            })}</code>`, "text/html")]);
          }
          throw new Error("cleanup-join read crossed its exact profile path");
        },
        close: () => {
          events.push("close");
          return Promise.reject(new Error("simulated lost close acknowledgement"));
        },
        cleanup: () => {
          events.push("cleanup-started");
          cleanupStarted.resolve();
          return proof.promise.then(() => { events.push("cleanup-proved"); });
        },
      };
      let provider: Promise<WebSessionExecution> | undefined;
      let settled = false;
      const execution = withReadCleanupAdmission({
        runId: randomUUID(),
        pluginId: "linkedin-web",
        pluginVersion: "1.0.0",
        pluginImplementationHash: "1".repeat(64),
        adapterId: "linkedin-web",
        adapterHash: "2".repeat(64),
        surfaceId: "linkedin",
        authId: auth.id,
        authHash: "3".repeat(64),
      }, environment, register => runWebSessionReadWithDeadline(recipe, {
        signal: caller.signal,
        deadlineClock: clock,
        registerCleanupBarrier: barrier => {
          barriers.push(barrier);
          return register(barrier);
        },
      }, options => {
        provider = executeLinkedInWebOperation(recipe, action === "profiles.read" ? {
          profile_url: PROFILE_URL,
          include_connections: false,
        } : { organization_url: ORGANIZATION_URL }, auth, {
          ...options,
          dependencies: {
            acquireCookies: () => Promise.reject(new Error("cleanup-join read exported cookies")),
            fetch: () => Promise.reject(new Error("cleanup-join read used direct fetch")),
            now: () => Date.parse("2026-09-06T00:00:00.000Z"),
            createProfileBrowserTransport: (receivedAuth, transportOptions) =>
              createLinkedInProfileBrowserTransport(receivedAuth, {
                ...transportOptions,
                dependencies: { createBrowserSession: () => Promise.resolve(session) },
              }),
          },
        });
        return provider;
      }), undefined, error => Promise.reject(error));
      const observed = execution.then(
        value => { settled = true; return { kind: "succeeded" as const, value }; },
        error => { settled = true; return { kind: "failed" as const, error }; },
      );
      try {
        await cleanupStarted.promise;
        expect(events).toEqual(["/voyager/api/me", targetPath, "close", "cleanup-started"]);
        expect(settled).toBeFalse();
        expect(barriers).toHaveLength(1);
        expect(listWebSessionCleanupAdmissions(environment)).toHaveLength(1);
        if (proofTiming === "after-join-timeout") {
          caller.abort();
          const expireJoin = await joinScheduled.promise;
          expect(settled).toBeFalse();
          expireJoin();
          const outcome = await observed;
          expect(outcome.kind).toBe("failed");
          if (outcome.kind === "failed") {
            expect(outcome.error).toBeInstanceOf(WebSessionCleanupUnverifiedError);
            await expect(barriers[0]!).rejects.toBe(outcome.error);
          }
          expect(listWebSessionCleanupAdmissions(environment)).toMatchObject([
            { claim: { containment: { status: "cleanup-unsafe" } } },
          ]);
        }
        proof.resolve();
        if (provider === undefined) throw new Error("profile provider was not started");
        const completed = await provider;
        expect(completed).toMatchObject({
          status: "succeeded",
          dispatchStarted: false,
          dispatch: { planned: 0, started: 0, verified: 0 },
          output: {
            target: { id: action === "profiles.read" ? auth.subject : "urn:li:fsd_company:123" },
            metrics: { followers: { value: action === "profiles.read" ? 7553 : 6 } },
          },
        });
        const outcome = await observed;
        if (proofTiming === "within-join") {
          expect(outcome).toEqual({ kind: "succeeded", value: completed });
          await expect(barriers[0]!).resolves.toBeUndefined();
          expect(listWebSessionCleanupAdmissions(environment)).toEqual([]);
        } else {
          expect(outcome.kind).toBe("failed");
          if (outcome.kind === "failed") await expect(barriers[0]!).rejects.toBe(outcome.error);
          expect(listWebSessionCleanupAdmissions(environment)).toMatchObject([
            { claim: { containment: { status: "cleanup-unsafe" } } },
          ]);
        }
        expect(events.filter(event => event === "close")).toHaveLength(1);
        expect(events.filter(event => event === "cleanup-proved")).toHaveLength(1);
        expect(timers.size).toBe(0);
      } finally {
        proof.resolve();
        caller.abort();
        await observed;
        await provider?.catch(() => undefined);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  test("preserves startup and command deadline state before provider classification", async () => {
    for (const failure of ["cancelled", "timed-out"] as const) {
      const createDeadline = (): OperationDeadline => {
        if (failure === "timed-out") return new OperationDeadline(0);
        const controller = new AbortController();
        controller.abort("private cancellation reason");
        return new OperationDeadline(1_000, { signal: controller.signal });
      };

      const startupDeadline = createDeadline();
      try {
        await expect(createLinkedInProfileBrowserTransport(auth, {
          timeoutMs: 1_000,
          maxOutputBytes: 1_024,
          operationDeadline: startupDeadline,
          dependencies: {
            createBrowserSession: () => Promise.reject(
              new Error("private startup failure"),
            ),
          },
        })).rejects.toMatchObject({ failure });
      } finally {
        startupDeadline.dispose();
      }

      const commandDeadline = createDeadline();
      const session: BrowserSession = {
        runBatch: () => Promise.reject(new Error("private command failure")),
        close: () => Promise.resolve(),
        cleanup: () => Promise.resolve(),
      };
      try {
        const transport = await createLinkedInProfileBrowserTransport(auth, {
          timeoutMs: 1_000,
          maxOutputBytes: 1_024,
          operationDeadline: commandDeadline,
          dependencies: {
            createBrowserSession: () => Promise.resolve(session),
          },
        });
        await expect(transport.currentIdentityResponse()).rejects.toMatchObject({
          failure,
        });
        await transport.close();
      } finally {
        commandDeadline.dispose();
      }
    }
  });

  test("performs one exact personal identity, profile, and connections sequence with a serialization-safe body bound", async () => {
    const escapeHeavyHtml = `<html>${'"\\\n'.repeat(300)}</html>`;
    expect(Buffer.byteLength(escapeHeavyHtml)).toBeLessThanOrEqual(1_024);
    const requests: BrowserReadBinding[] = [];
    const bootstrapCommands: string[][] = [];
    const evalOutputBounds: number[] = [];
    let sessionOptions: CreateBrowserSessionOptions | null = null;
    let closed = false;
    let cleaned = false;
    const session: BrowserSession = {
      runBatch: (commands, _timeoutMs, maxOutputBytes) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          bootstrapCommands.push([...command]);
          return Promise.resolve([{ success: true, result: {} }]);
        }
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn profile browser command");
        }
        evalOutputBounds.push(maxOutputBytes);
        const binding = requestBinding(command[1]);
        requests.push(binding);
        if (binding.path === "/voyager/api/me") {
          return Promise.resolve([browserBodyRecord(
            identityResponse(),
            "application/vnd.linkedin.normalized+json+2.1",
          )]);
        }
        if (binding.path === "/in/0thernet/") {
          return Promise.resolve([browserBodyRecord(escapeHeavyHtml, "text/html")]);
        }
        if (binding.path === "/mynetwork/invite-connect/connections/") {
          return Promise.resolve([browserBodyRecord(
            "<html><h1>4,877 connections</h1></html>",
            "text/html",
          )]);
        }
        throw new Error(`unexpected LinkedIn profile browser path ${binding.path}`);
      },
      close: () => {
        closed = true;
        return Promise.resolve();
      },
      cleanup: () => {
        cleaned = true;
        return Promise.resolve();
      },
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
      dependencies: {
        createBrowserSession: (manifest, receivedAuth, options) => {
          expect(manifest).toMatchObject({ id: "linkedin-profile-runtime" });
          expect(receivedAuth).toEqual(auth);
          sessionOptions = options;
          return Promise.resolve(session);
        },
      },
    });

    expect(await transport.currentIdentityResponse()).toEqual(
      JSON.parse(identityResponse()),
    );
    expect(await transport.readProfileHtml(PROFILE_URL)).toBe(escapeHeavyHtml);
    expect(await transport.readConnectionsHtml(PROFILE_URL)).toContain(
      "4,877 connections",
    );
    await transport.close();

    expect(requests).toEqual([
      {
        kind: "json",
        maxBytes: 1_024,
        path: "/voyager/api/me",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "html",
        maxBytes: 1_024,
        path: "/in/0thernet/",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "html",
        maxBytes: 1_024,
        path: "/mynetwork/invite-connect/connections/",
        referrer: PROFILE_URL,
      },
    ]);
    expect(bootstrapCommands).toEqual([]);
    const encodedBound = Math.ceil(1_024 / 3) * 4 + 64 * 1_024;
    expect(sessionOptions).not.toBeNull();
    expect((sessionOptions as unknown as CreateBrowserSessionOptions).maxOutputBytes)
      .toBe(encodedBound);
    expect(evalOutputBounds).toEqual([encodedBound, encodedBound, encodedBound]);
    expect(closed).toBeTrue();
    expect(cleaned).toBeTrue();
  });

  test("performs one exact identity, profile, and Contact-info GraphQL sequence", async () => {
    const requests: BrowserReadBinding[] = [];
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: {} }]);
        }
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn contact-info browser command");
        }
        const binding = requestBinding(command[1]);
        requests.push(binding);
        if (binding.path === "/voyager/api/me") {
          return Promise.resolve([browserBodyRecord(identityResponse(), "application/json")]);
        }
        if (binding.path === "/in/0thernet/") {
          return Promise.resolve([browserBodyRecord("<html>1st</html>", "text/html")]);
        }
        if (binding.path.startsWith("/voyager/api/graphql") && binding.path.includes("voyagerIdentityDashProfileContactInfo")) {
          return Promise.resolve([browserBodyRecord(
            '{"emailAddress":"connection@example.test"}',
            "application/vnd.linkedin.normalized+json+2.1",
          )]);
        }
        throw new Error(`unexpected LinkedIn contact-info path ${binding.path}`);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const contactInput = {
      profileUrl: PROFILE_URL,
      profileUrn: "urn:li:fsd_profile:ACoAAFixtureProfile",
    };
    expect(await transport.currentIdentityResponse()).toEqual(JSON.parse(identityResponse()));
    expect(await transport.readProfileHtml(PROFILE_URL)).toBe("<html>1st</html>");
    expect(await transport.readContactInfoJson(contactInput)).toEqual({
      emailAddress: "connection@example.test",
    });
    await expect(transport.readConnectionsHtml(PROFILE_URL)).rejects.toThrow("out of order");
    expect(requests).toEqual([
      {
        kind: "json",
        maxBytes: 2 * 1024 * 1024,
        path: "/voyager/api/me",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "html",
        maxBytes: 2 * 1024 * 1024,
        path: "/in/0thernet/",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "json",
        maxBytes: 2 * 1024 * 1024,
        path: buildLinkedInProfileContactInfoGraphqlPath({
          profileUrn: contactInput.profileUrn,
        }),
        referrer: PROFILE_URL,
      },
    ]);
    await transport.close();
  });

  test("performs one exact identity, profile, and Contact-info overlay sequence", async () => {
    const requests: BrowserReadBinding[] = [];
    const overlayBody = [
      '1:I["com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay"]',
      `2:${JSON.stringify({
        fields: [
          { label: "Email", value: "connection@example.test" },
          { label: "Connected since", value: "October 3, 2023" },
        ],
      })}`,
    ].join("\n");
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: {} }]);
        }
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn contact-info overlay browser command");
        }
        const binding = requestBinding(command[1]);
        requests.push(binding);
        if (binding.path === "/voyager/api/me") {
          return Promise.resolve([browserBodyRecord(identityResponse(), "application/json")]);
        }
        if (binding.path === "/in/0thernet/") {
          return Promise.resolve([browserBodyRecord("<html>1st</html>", "text/html")]);
        }
        if (binding.path === "/in/0thernet/overlay/contact-info/") {
          expect(binding.kind).toBe("rsc");
          expect(command[1]).toContain('accept:"text/x-component"');
          expect(command[1]).toContain('RSC:"1"');
          return Promise.resolve([browserBodyRecord(overlayBody, "text/x-component")]);
        }
        throw new Error(`unexpected LinkedIn contact-info overlay path ${binding.path}`);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const contactInput = {
      profileUrl: PROFILE_URL,
      profileUrn: "urn:li:fsd_profile:ACoAAFixtureProfile",
    };
    expect(await transport.currentIdentityResponse()).toEqual(JSON.parse(identityResponse()));
    expect(await transport.readProfileHtml(PROFILE_URL)).toBe("<html>1st</html>");
    expect(await transport.readContactOverlayText(contactInput)).toBe(overlayBody);
    await expect(transport.readContactInfoJson(contactInput)).rejects.toThrow("out of order");
    expect(requests).toEqual([
      {
        kind: "json",
        maxBytes: 2 * 1024 * 1024,
        path: "/voyager/api/me",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "html",
        maxBytes: 2 * 1024 * 1024,
        path: "/in/0thernet/",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "rsc",
        maxBytes: 2 * 1024 * 1024,
        path: buildLinkedInProfileContactInfoOverlayPath({
          profileUrl: PROFILE_URL,
        }),
        referrer: PROFILE_URL,
      },
    ]);
    await transport.close();
  });

  test("POSTs the page-bound Contact-info navigation action without RSC headers", async () => {
    const requests: BrowserReadBinding[] = [];
    const overlayBody = [
      '1:I["com.linkedin.sdui.flagshipnav.profile.ProfileContactDetailsOverlay"]',
      `2:${JSON.stringify({
        fields: [
          { label: "Email", value: "connection@example.test" },
        ],
      })}`,
    ].join("\n");
    const sduiid = LINKEDIN_CONTACT_DETAILS_OVERLAY_SCREEN_ID;
    const navigationPath = buildLinkedInProfileContactDetailsNavigationPostPath({ sduiid });
    const navigationBody = buildLinkedInContactNavigationBody({
      clientArguments: {
        payload: { vanityName: "0thernet" },
      },
    });
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: {} }]);
        }
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn contact-info navigation browser command");
        }
        const binding = requestBinding(command[1]);
        requests.push(binding);
        if (binding.path === "/voyager/api/me") {
          return Promise.resolve([browserBodyRecord(identityResponse(), "application/json")]);
        }
        if (binding.path === "/in/0thernet/") {
          return Promise.resolve([browserBodyRecord("<html>1st</html>", "text/html")]);
        }
        if (binding.path === navigationPath) {
          expect(binding.kind).toBe("rsc-action");
          expect(binding.body).toBe(navigationBody);
          expect(command[1]).toContain(
            'input.kind==="rsc-action"?{accept:"*/*","content-type":"application/json"}',
          );
          expect(command[1]).toContain('method:input.kind==="rsc-action"?"POST":"GET"');
          expect(command[1]).toContain('csrf-token');
          expect(command[1]).toContain("application/octet-stream");
          expect(command[1]).not.toContain("Next-Router-State-Tree");
          expect(command[1]).not.toContain("Next-Action");
          return Promise.resolve([browserBodyRecord(overlayBody, "application/octet-stream")]);
        }
        throw new Error(`unexpected LinkedIn contact-info navigation path ${binding.path}`);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    expect(await transport.currentIdentityResponse()).toEqual(JSON.parse(identityResponse()));
    expect(await transport.readProfileHtml(PROFILE_URL)).toBe("<html>1st</html>");
    expect(await transport.readContactNavigationText({
      profileUrl: PROFILE_URL,
      profileUrn: "urn:li:fsd_profile:ACoAAFixtureProfile",
      sduiid,
      clientArguments: {
        payload: { vanityName: "0thernet" },
      },
    })).toBe(overlayBody);
    await expect(transport.readContactOverlayText({
      profileUrl: PROFILE_URL,
      profileUrn: "urn:li:fsd_profile:ACoAAFixtureProfile",
    })).rejects.toThrow("out of order");
    expect(requests).toEqual([
      {
        kind: "json",
        maxBytes: 2 * 1024 * 1024,
        path: "/voyager/api/me",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "html",
        maxBytes: 2 * 1024 * 1024,
        path: "/in/0thernet/",
        referrer: "https://www.linkedin.com/feed/",
      },
      {
        kind: "rsc-action",
        maxBytes: 2 * 1024 * 1024,
        path: navigationPath,
        referrer: PROFILE_URL,
        body: navigationBody,
      },
    ]);
    await transport.close();
  });

  test("keeps Contact-info GraphQL rejection in profile state so overlay can follow", async () => {
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: {} }]);
        }
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn contact-info fallback browser command");
        }
        const binding = requestBinding(command[1]);
        if (binding.path === "/voyager/api/me") {
          return Promise.resolve([browserBodyRecord(identityResponse(), "application/json")]);
        }
        if (binding.path === "/in/0thernet/") {
          return Promise.resolve([browserBodyRecord("<html>1st</html>", "text/html")]);
        }
        if (binding.path.startsWith("/voyager/api/graphql")) {
          return Promise.resolve([browserRejectionRecord(403, "text/html")]);
        }
        if (binding.path === "/in/0thernet/overlay/contact-info/") {
          return Promise.resolve([browserBodyRecord(
            '1:{"emailAddress":"connection@example.test"}',
            "text/x-component",
          )]);
        }
        throw new Error(`unexpected LinkedIn contact-info fallback path ${binding.path}`);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const contactInput = {
      profileUrl: PROFILE_URL,
      profileUrn: "urn:li:fsd_profile:ACoAAFixtureProfile",
    };
    await transport.currentIdentityResponse();
    await transport.readProfileHtml(PROFILE_URL);
    await expect(transport.readContactInfoJson(contactInput)).rejects.toBeInstanceOf(
      LinkedInProfileBrowserResponseRejectedError,
    );
    expect(await transport.readContactOverlayText(contactInput)).toBe(
      '1:{"emailAddress":"connection@example.test"}',
    );
    await transport.close();
  });

  test("allows only one company page after the exact current-member request", async () => {
    const paths: string[] = [];
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: {} }]);
        }
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn organization browser command");
        }
        const binding = requestBinding(command[1]);
        paths.push(binding.path);
        return Promise.resolve([binding.kind === "json"
          ? browserBodyRecord(identityResponse(), "application/json")
          : browserBodyRecord("<html>6 followers</html>", "text/html")]);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    expect(await transport.readOrganizationHtml(ORGANIZATION_URL)).toBe(
      "<html>6 followers</html>",
    );
    expect(paths).toEqual(["/voyager/api/me", "/company/hraness/"]);
    await expect(transport.readProfileHtml(PROFILE_URL)).rejects.toThrow(
      "out of order",
    );
    await transport.close();
  });

  test("preserves a completed company read when cleanup proves a natural exit after close acknowledgement is lost", async () => {
    const paths: string[] = [];
    let closeAttempts = 0;
    let cleanupAttempts = 0;
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn organization browser command");
        }
        const binding = requestBinding(command[1]);
        paths.push(binding.path);
        return Promise.resolve([binding.kind === "json"
          ? browserBodyRecord(identityResponse(), "application/json")
          : browserBodyRecord("<html>6 followers</html>", "text/html")]);
      },
      close: () => {
        closeAttempts += 1;
        return Promise.reject(new Error("simulated lost close acknowledgement"));
      },
      cleanup: () => {
        cleanupAttempts += 1;
        return Promise.resolve();
      },
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });

    const identity = await transport.currentIdentityResponse();
    const organization = await transport.readOrganizationHtml(ORGANIZATION_URL);
    await transport.close();
    await transport.close();

    expect(identity).toEqual(JSON.parse(identityResponse()));
    expect(organization).toBe("<html>6 followers</html>");
    expect(paths).toEqual(["/voyager/api/me", "/company/hraness/"]);
    expect(closeAttempts).toBe(1);
    expect(cleanupAttempts).toBe(1);
  });

  test("rejects cross-origin evaluations and each corrupt body-integrity field", async () => {
    const body = identityResponse();
    const fixtures = [
      {
        name: "cross-origin evaluation",
        response: browserBodyRecord(body, "application/json", {
          origin: "https://example.com/feed/",
        }),
        category: "response-envelope",
        message: "LinkedIn stats browser returned a malformed evaluation envelope",
      },
      {
        name: "invalid base64",
        response: browserBodyRecord(body, "application/json", {
          bodyBase64: "not-base64!",
        }),
        category: "body-envelope",
        message: "LinkedIn stats browser body envelope changed shape",
      },
      {
        name: "wrong byte count",
        response: browserBodyRecord(body, "application/json", {
          bodyBytes: Buffer.byteLength(body) + 1,
        }),
        category: "body-envelope",
        message: "LinkedIn stats browser body envelope failed integrity verification",
      },
      {
        name: "wrong SHA-256",
        response: browserBodyRecord(body, "application/json", {
          bodySha256: "0".repeat(64),
        }),
        category: "body-envelope",
        message: "LinkedIn stats browser body envelope failed integrity verification",
      },
      {
        name: "impossible JSON authwall",
        response: browserBodyRecord(body, "application/json", {
          authWall: true,
        }),
        category: "response-envelope",
        message: "LinkedIn stats browser returned a malformed authwall envelope",
      },
      {
        name: "body-bearing provider rejection",
        response: browserBodyRecord("private-token", "text/html", {
          status: 401,
        }),
        category: "response-envelope",
        message: "LinkedIn stats browser returned a malformed rejection envelope",
      },
    ] as const;

    for (const fixture of fixtures) {
      const session: BrowserSession = {
        runBatch: (commands) => {
          const command = commands[0];
          if (command?.[0] === "open" || command?.[0] === "wait") {
            return Promise.resolve([{ success: true, result: {} }]);
          }
          if (command?.[0] !== "eval") {
            throw new Error(`unexpected command in ${fixture.name} fixture`);
          }
          return Promise.resolve([fixture.response]);
        },
        close: () => Promise.resolve(),
        cleanup: () => Promise.resolve(),
      };
      const transport = await createLinkedInProfileBrowserTransport(auth, {
        timeoutMs: 1_000,
        maxOutputBytes: 2 * 1024 * 1024,
        dependencies: { createBrowserSession: () => Promise.resolve(session) },
      });
      const error = await transport.currentIdentityResponse().then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(LinkedInProfileBrowserFailure);
      expect(error).toMatchObject({
        category: fixture.category,
        message: fixture.message,
      });
      await transport.close();
    }
  });

  test("never retries post-cookie context, origin, provider, or authwall failures", async () => {
    let evaluations = 0;
    let mode: "authwall" | "content-type" | "context" | "fetch" | "origin" | "session-cookie" | "status" = "context";
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] !== "eval" || command[1] === undefined) {
          throw new Error("unexpected LinkedIn retry browser command");
        }
        requestBinding(command[1]);
        evaluations += 1;
        if (mode === "context" && evaluations === 1) {
          return Promise.reject(new Error("Cannot find default execution context"));
        }
        if (mode === "origin") {
          return Promise.reject(new Error("unexpected LinkedIn origin"));
        }
        if (mode === "session-cookie") {
          return Promise.reject(new Error(
            "agent-browser batch failed with exit code 1: missing LinkedIn browser CSRF cookie",
          ));
        }
        if (mode === "fetch") {
          return Promise.reject(new Error(
            "agent-browser batch failed with exit code 1: page.evaluate: TypeError: Failed to fetch",
          ));
        }
        if (mode === "status") {
          return Promise.resolve([browserRejectionRecord(401, "text/html")]);
        }
        if (mode === "content-type") {
          return Promise.resolve([browserRejectionRecord(200, "text/html")]);
        }
        if (mode === "authwall" && evaluations > 1) {
          return Promise.resolve([browserBodyRecord("private-token", "text/html", {
            authWall: true,
          })]);
        }
        return Promise.resolve([browserBodyRecord(identityResponse(), "application/json")]);
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };

    const first = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const contextError = await first.currentIdentityResponse()
      .then(() => null, (error: unknown) => error);
    expect(contextError).toBeInstanceOf(LinkedInProfileBrowserFailure);
    expect(contextError).toMatchObject({ category: "execution-context" });
    expect(evaluations).toBe(1);
    await first.close();

    mode = "origin";
    evaluations = 0;
    const originRejected = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const originError = await originRejected.currentIdentityResponse()
      .then(() => null, (error: unknown) => error);
    expect(originError).toBeInstanceOf(LinkedInProfileBrowserFailure);
    expect(originError).toMatchObject({ category: "bootstrap" });
    expect(evaluations).toBe(1);
    await originRejected.close();

    mode = "status";
    evaluations = 0;
    const rejected = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const statusError = await rejected.currentIdentityResponse()
      .then(() => null, (error: unknown) => error);
    expect(statusError).toBeInstanceOf(LinkedInProfileBrowserResponseRejectedError);
    expect(statusError).toMatchObject({ status: 401, contentType: "text/html" });
    expect(String(statusError)).not.toContain("private-token");
    expect(evaluations).toBe(1);
    await rejected.close();

    mode = "content-type";
    evaluations = 0;
    const wrongContentType = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    const contentTypeError = await wrongContentType.currentIdentityResponse()
      .then(() => null, (error: unknown) => error);
    expect(contentTypeError).toBeInstanceOf(LinkedInProfileBrowserResponseRejectedError);
    expect(contentTypeError).toMatchObject({ status: 200, contentType: "text/html" });
    expect(String(contentTypeError)).not.toContain("private-token");
    expect(evaluations).toBe(1);
    await wrongContentType.close();

    for (const item of [
      { mode: "session-cookie", category: "session-cookie" },
      { mode: "fetch", category: "provider-fetch" },
    ] as const) {
      mode = item.mode;
      evaluations = 0;
      const commandRejected = await createLinkedInProfileBrowserTransport(auth, {
        timeoutMs: 1_000,
        maxOutputBytes: 2 * 1024 * 1024,
        dependencies: { createBrowserSession: () => Promise.resolve(session) },
      });
      const commandError = await commandRejected.currentIdentityResponse()
        .then(() => null, (error: unknown) => error);
      expect(commandError).toBeInstanceOf(LinkedInProfileBrowserFailure);
      expect(commandError).toMatchObject({ category: item.category });
      expect(evaluations).toBe(1);
      await commandRejected.close();
    }

    mode = "authwall";
    evaluations = 0;
    const authwall = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await authwall.currentIdentityResponse();
    const authwallMessage = await authwall.readProfileHtml(PROFILE_URL)
      .then(() => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
    expect(authwallMessage).toBe(
      "LinkedIn stats browser reached the signed-out authwall",
    );
    expect(authwallMessage).not.toContain("private-token");
    expect(evaluations).toBe(2);
    await authwall.close();
  });

  test("rewrites only the auth-kind-specific initial batch before command execution", async () => {
    type CommandRunner = NonNullable<
      NonNullable<CreateBrowserSessionOptions["dependencies"]>["runCommand"]
    >;
    type CommandOptions = Parameters<CommandRunner>[1];
    const calls: {
      readonly command: readonly string[];
      readonly options: CommandOptions;
    }[] = [];
    const execute: CommandRunner = (command, options) => {
      calls.push({ command, options });
      return Promise.resolve({ exitCode: 0, stderr: "", stdout: "{}" });
    };
    const createWrapped = async (browserAuth: GhostgetAuth): Promise<{
      readonly close: () => Promise<void>;
      readonly run: CommandRunner;
    }> => {
      let capturedOptions: CreateBrowserSessionOptions | null = null;
      const session: BrowserSession = {
        runBatch: () => Promise.resolve([{ success: true, result: {} }]),
        close: () => Promise.resolve(),
        cleanup: () => Promise.resolve(),
      };
      const transport = await createLinkedInProfileBrowserTransport(browserAuth, {
        timeoutMs: 1_000,
        maxOutputBytes: 2 * 1024 * 1024,
        dependencies: {
          createBrowserSession: (_manifest, _auth, options) => {
            capturedOptions = options;
            return Promise.resolve(session);
          },
          runCommand: execute,
        },
      });
      const run = (capturedOptions as unknown as CreateBrowserSessionOptions)
        .dependencies?.runCommand;
      if (run === undefined) throw new Error("missing LinkedIn command wrapper");
      return { close: transport.close, run };
    };
    const command = Object.freeze(["agent-browser", "batch", "--bail", "--json"]);
    const baseOptions = Object.freeze({
      cwd: "/tmp/linkedin-profile-browser-test",
      environment: Object.freeze({ TEST_MODE: "contained" }),
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
    });

    const profile = await createWrapped(auth);
    const exactBlankOptions = Object.freeze({
      ...baseOptions,
      stdin: '[["open","about:blank"]]',
    });
    await profile.run(command, exactBlankOptions);
    expect(calls[0]?.command).toBe(command);
    expect(calls[0]?.options).toEqual({
      ...exactBlankOptions,
      stdin: '[["open","https://www.linkedin.com/robots.txt"]]',
    });
    expect(calls[0]?.options).not.toBe(exactBlankOptions);

    await profile.run(command, exactBlankOptions);
    expect(calls[1]?.options).toBe(exactBlankOptions);
    await profile.close();

    const exact = await createWrapped(cookieSourceAuth);
    const exactRootOptions = Object.freeze({
      ...baseOptions,
      stdin: '[["open","https://www.linkedin.com"]]',
    });
    await exact.run(command, exactRootOptions);
    expect(calls[2]?.command).toBe(command);
    expect(calls[2]?.options).toEqual({
      ...exactRootOptions,
      stdin: '[["open","https://www.linkedin.com/robots.txt"]]',
    });
    expect(calls[2]?.options).not.toBe(exactRootOptions);

    await exact.run(command, exactRootOptions);
    expect(calls[3]?.options).toBe(exactRootOptions);
    const cookieOptions = Object.freeze({
      ...baseOptions,
      stdin: '[["cookies","set","li_at","fixture","--url","https://www.linkedin.com"]]',
    });
    const evaluationOptions = Object.freeze({
      ...baseOptions,
      stdin: '[["eval","readOnlyIdentityFixture()"]]',
    });
    await exact.run(command, cookieOptions);
    await exact.run(command, evaluationOptions);
    expect(calls[4]?.options).toBe(cookieOptions);
    expect(calls[5]?.options).toBe(evaluationOptions);
    await exact.close();

    const nonExact = await createWrapped(cookieSourceAuth);
    const whitespaceVariant = Object.freeze({
      ...baseOptions,
      stdin: '[[ "open", "https://www.linkedin.com" ]]',
    });
    await nonExact.run(command, whitespaceVariant);
    expect(calls[6]?.options).toBe(whitespaceVariant);
    await nonExact.close();
  });

  test("retries only the cookie-source root and never the browser-profile blank navigation", async () => {
    let capturedOptions: CreateBrowserSessionOptions | null = null;
    let commandCalls = 0;
    let settlements = 0;
    const contextFailure = {
      exitCode: 1,
      stderr: "",
      stdout: "Failed to install browser network controls: CDP error (Runtime.evaluate): Cannot find default execution context",
    } as const;
    const commandRunner = () => {
      commandCalls += 1;
      return Promise.resolve(commandCalls === 1 || commandCalls === 3
        ? contextFailure
        : { exitCode: 0, stderr: "", stdout: "{}" });
    };
    const session: BrowserSession = {
      runBatch: () => Promise.resolve([{ success: true, result: {} }]),
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInProfileBrowserTransport(cookieSourceAuth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: {
        createBrowserSession: (_manifest, _auth, options) => {
          capturedOptions = options;
          return Promise.resolve(session);
        },
        runCommand: commandRunner,
        settleContext: () => {
          settlements += 1;
          return Promise.resolve();
        },
      },
    });
    expect(capturedOptions).not.toBeNull();
    const wrapped = (capturedOptions as unknown as CreateBrowserSessionOptions)
      .dependencies?.runCommand;
    if (wrapped === undefined) throw new Error("missing LinkedIn command wrapper");
    const commandOptions = {
      cwd: "/tmp/linkedin-profile-browser-test",
      environment: {},
      timeoutMs: 1_000,
      maxOutputBytes: 1_024,
      stdin: JSON.stringify([["open", "https://www.linkedin.com"]]),
    } as const;
    expect(await wrapped(["agent-browser", "batch"], commandOptions))
      .toEqual({ exitCode: 0, stderr: "", stdout: "{}" });
    expect(commandCalls).toBe(2);
    expect(settlements).toBe(1);

    expect(await wrapped(["agent-browser", "batch"], {
      ...commandOptions,
      stdin: JSON.stringify([["eval", "readOnlyIdentityFixture()"]]),
    })).toEqual(contextFailure);
    expect(commandCalls).toBe(3);
    expect(settlements).toBe(1);
    await transport.close();

    let profileOptions: CreateBrowserSessionOptions | null = null;
    let profileCalls = 0;
    let profileSettlements = 0;
    const profileTransport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: {
        createBrowserSession: (_manifest, _auth, options) => {
          profileOptions = options;
          return Promise.resolve(session);
        },
        runCommand: () => {
          profileCalls += 1;
          return Promise.resolve(contextFailure);
        },
        settleContext: () => {
          profileSettlements += 1;
          return Promise.resolve();
        },
      },
    });
    const profileWrapped = (profileOptions as unknown as CreateBrowserSessionOptions)
      .dependencies?.runCommand;
    if (profileWrapped === undefined) throw new Error("missing LinkedIn profile command wrapper");
    expect(await profileWrapped(["agent-browser", "batch"], {
      ...commandOptions,
      stdin: JSON.stringify([["open", "about:blank"]]),
    })).toEqual(contextFailure);
    expect(profileCalls).toBe(1);
    expect(profileSettlements).toBe(0);
    await profileTransport.close();
  });

  test("fails cleanup closed when private browser artifact removal is not verified", async () => {
    const session: BrowserSession = {
      runBatch: () => Promise.resolve([{ success: true, result: {} }]),
      close: () => Promise.resolve(),
      cleanup: () => Promise.reject(new Error("private cleanup fixture")),
      recoveryHandle: "session=private-fixture",
    };
    const transport = await createLinkedInProfileBrowserTransport(auth, {
      timeoutMs: 1_000,
      maxOutputBytes: 2 * 1024 * 1024,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await expect(transport.close()).rejects.toBeInstanceOf(
      PreservedBrowserArtifactsError,
    );
  });
});
