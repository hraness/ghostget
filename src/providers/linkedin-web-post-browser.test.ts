import { describe, expect, test } from "bun:test";

import type { GhostgetAuth } from "../auth";
import type { BrowserSession } from "../browser";
import {
  createLinkedInPostBrowserTransport,
  LinkedInPostImagePreparationError,
} from "./linkedin-web-post-browser";

const auth = {
  schemaVersion: 1,
  id: "linkedin-post-browser-test",
  kind: "browser-profile",
  profile: "Disposable LinkedIn",
  browserExecutable: "/Applications/Chromium.app/Contents/MacOS/Chromium",
  trustUnfilteredEgress: true,
  subject: "urn:li:fsd_profile:123456789",
} as const satisfies GhostgetAuth;

const FIRST_PAGE_INSTANCE =
  "urn:li:page:d_flagship3_feed_first;fixture==";
const NEWEST_PAGE_INSTANCE =
  "urn:li:page:d_flagship3_feed_newest;fixture==";
const firstTrack = JSON.stringify({ mpName: "voyager-web", request: "first" });
const newestTrack = JSON.stringify({ mpName: "voyager-web", request: "newest" });

function browserRecord(
  result: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    success: true,
    result: { origin: "https://www.linkedin.com/feed/", result },
  };
}

function sourceInput(source: string): Readonly<Record<string, unknown>> {
  const match = /const input=(\{.*?\});if\(location\.origin/u.exec(source);
  if (match?.[1] === undefined) throw new Error("missing LinkedIn evaluation input");
  return JSON.parse(match[1]) as Readonly<Record<string, unknown>>;
}

function pageBindingRecord(): Readonly<Record<string, unknown>> {
  return {
    success: true,
    result: {
      requests: [
        {
          method: "GET",
          status: 200,
          url: "https://www.linkedin.com/voyager/api/graphql?fixture=first",
          headers: {
            "x-li-page-instance": FIRST_PAGE_INSTANCE,
            "x-li-track": firstTrack,
          },
        },
        {
          method: "GET",
          status: 200,
          url: "https://www.linkedin.com/voyager/api/graphql?fixture=newest",
          headers: {
            "x-li-page-instance": NEWEST_PAGE_INSTANCE,
            "x-li-track": newestTrack,
          },
        },
      ],
    },
  };
}

describe("LinkedIn native post contained-browser transport", () => {
  test("stages a real-size image in bounded ordered batches, cleans it up, and runs one upload and create", async () => {
    const image = new Uint8Array(1_255_642);
    for (let index = 0; index < image.length; index += 1) image[index] = index % 251;
    const expectedBase64 = Buffer.from(image).toString("base64");
    const stagedChunks: string[] = [];
    const stagingBatchSizes: number[] = [];
    const stagingSourceLengths: number[] = [];
    const cleanupKeys: string[] = [];
    let initializedKey = "";
    let uploadInput: Readonly<Record<string, unknown>> | null = null;
    let uploads = 0;
    let uploadSource = "";
    let creates = 0;
    let readbacks = 0;
    let closed = false;
    let cleaned = false;
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open") {
          expect(commands).toEqual([
            ["open", "https://www.linkedin.com/feed/"],
            ["wait", "5000"],
          ]);
          return Promise.resolve([{ success: true, result: { opened: true } }]);
        }
        if (command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: { waited: true } }]);
        }
        if (command?.[0] === "network") return Promise.resolve([pageBindingRecord()]);
        if (commands.some((candidate) => candidate[0] !== "eval" || candidate[1] === undefined)) {
          throw new Error("unexpected LinkedIn post browser command");
        }
        const sources = commands.map((candidate) => candidate[1]!);
        if (sources[0]?.includes("return{ready:true}")) {
          expect(sources).toHaveLength(1);
          initializedKey = String(sourceInput(sources[0]).stagingKey);
          return Promise.resolve([browserRecord({ ready: true })]);
        }
        if (sources[0]?.includes("return{staged:chunks.length}")) {
          stagingBatchSizes.push(sources.length);
          return Promise.resolve(sources.map((source) => {
            const input = sourceInput(source);
            expect(input.stagingKey).toBe(initializedKey);
            expect(input.index).toBe(stagedChunks.length);
            expect(input.expectedChunkCount).toBe(35);
            stagingSourceLengths.push(source.length);
            stagedChunks.push(String(input.chunk));
            return browserRecord({ staged: stagedChunks.length });
          }));
        }
        if (sources[0]?.includes("const registrationBody=")) {
          expect(sources).toHaveLength(1);
          uploads += 1;
          uploadSource = sources[0];
          uploadInput = sourceInput(sources[0]);
          return Promise.resolve([browserRecord({
            mediaUrn: "urn:li:digitalmediaAsset:C4D22AQExactImage",
          })]);
        }
        if (sources[0]?.includes("return{removed}")) {
          expect(sources).toHaveLength(1);
          cleanupKeys.push(String(sourceInput(sources[0]).stagingKey));
          return Promise.resolve([browserRecord({ removed: false })]);
        }
        if (sources[0]?.includes("const createPath=")) {
          expect(sources).toHaveLength(1);
          creates += 1;
          return Promise.resolve([browserRecord({
            entityUrn: "urn:li:fsd_share:7000000000000000000",
          })]);
        }
        if (sources[0]?.includes("LinkedIn post readback permalink")) {
          expect(sources).toHaveLength(1);
          readbacks += 1;
          return Promise.resolve([browserRecord({ read: true })]);
        }
        throw new Error("unexpected LinkedIn evaluation source");
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

    const transport = await createLinkedInPostBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: {
        createBrowserSession: () => Promise.resolve(session),
      },
    });
    const mediaUrn = await transport.uploadImage(auth.subject, image);
    expect(mediaUrn).toBe("urn:li:digitalmediaAsset:C4D22AQExactImage");
    const entityUrn = await transport.createPost(
      auth.subject,
      "urn:li:fsd_profile:ACoAAExactCurrentProfile",
      { post: { commentary: { text: "how your email finds me" } } },
      mediaUrn,
    );
    expect(entityUrn).toBe("urn:li:fsd_share:7000000000000000000");
    expect(await transport.readPost(
      auth.subject,
      "urn:li:fsd_profile:ACoAAExactCurrentProfile",
      { post: { commentary: { text: "how your email finds me" } } },
      mediaUrn,
      entityUrn,
    )).toEqual({ read: true });
    await transport.close();

    expect(stagingBatchSizes).toEqual([32, 3]);
    expect(stagingSourceLengths).toHaveLength(35);
    expect(stagingSourceLengths.every((length) => length <= 64 * 1024)).toBeTrue();
    expect(stagedChunks.join("")).toBe(expectedBase64);
    expect(uploadInput).toMatchObject({
      expectedBase64Length: expectedBase64.length,
      expectedByteLength: image.byteLength,
      expectedChunkCount: 35,
      pageInstance: NEWEST_PAGE_INSTANCE,
      stagingKey: initializedKey,
      track: newestTrack,
    });
    expect(uploadInput).not.toHaveProperty("imageBase64");
    expect(cleanupKeys).toEqual([initializedKey]);
    expect(uploads).toBe(1);
    expect(uploadSource).toContain('registration.type==="VECTOR"');
    expect(uploadSource).toContain('registration.$type!=="com.linkedin.mediauploader.MediaUploadMetadata"');
    expect(uploadSource).toContain('registration.singleUploadHeaders["media-type-family"]!=="STILLIMAGE"');
    expect(creates).toBe(1);
    expect(readbacks).toBe(1);
    expect(closed).toBeTrue();
    expect(cleaned).toBeTrue();
  });

  test("attempts exact staged-byte cleanup when a bounded chunk batch fails", async () => {
    const image = new Uint8Array(1_255_642);
    let stagingBatches = 0;
    let stagingKey = "";
    let cleanupKey = "";
    let uploads = 0;
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open") {
          return Promise.resolve([{ success: true, result: { opened: true } }]);
        }
        if (command?.[0] === "network") return Promise.resolve([pageBindingRecord()]);
        const source = command?.[1] ?? "";
        if (source.includes("return{ready:true}")) {
          stagingKey = String(sourceInput(source).stagingKey);
          return Promise.resolve([browserRecord({ ready: true })]);
        }
        if (source.includes("return{staged:chunks.length}")) {
          stagingBatches += 1;
          if (stagingBatches === 2) return Promise.reject(new Error("bounded staging failure"));
          return Promise.resolve(commands.map((candidate, index) => {
            const staged = Number(sourceInput(candidate[1] ?? "").index) + 1;
            expect(staged).toBe(index + 1);
            return browserRecord({ staged });
          }));
        }
        if (source.includes("return{removed}")) {
          cleanupKey = String(sourceInput(source).stagingKey);
          return Promise.resolve([browserRecord({ removed: true })]);
        }
        if (source.includes("const registrationBody=")) uploads += 1;
        throw new Error("unexpected LinkedIn evaluation source");
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInPostBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: {
        createBrowserSession: () => Promise.resolve(session),
      },
    });

    try {
      await transport.uploadImage(auth.subject, image);
      throw new Error("expected LinkedIn staging failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LinkedInPostImagePreparationError);
      expect(error).toMatchObject({ stage: "page image staging" });
      expect((error as Error).message).not.toContain("bounded staging failure");
    }
    await transport.close();
    expect(stagingBatches).toBe(2);
    expect(cleanupKey).toBe(stagingKey);
    expect(uploads).toBe(0);
  });

  test("categorizes a registration failure without exposing browser detail", async () => {
    const image = new Uint8Array(24);
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open") {
          return Promise.resolve([{ success: true, result: { opened: true } }]);
        }
        if (command?.[0] === "network") return Promise.resolve([pageBindingRecord()]);
        const source = command?.[1] ?? "";
        if (source.includes("return{ready:true}")) {
          return Promise.resolve([browserRecord({ ready: true })]);
        }
        if (source.includes("return{staged:chunks.length}")) {
          return Promise.resolve([browserRecord({ staged: 1 })]);
        }
        if (source.includes("const registrationBody=")) {
          return Promise.reject(new Error(
            "LinkedIn image registration returned an unreviewed field: private-detail",
          ));
        }
        if (source.includes("return{removed}")) {
          return Promise.resolve([browserRecord({ removed: true })]);
        }
        throw new Error("unexpected LinkedIn evaluation source");
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };
    const transport = await createLinkedInPostBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: {
        createBrowserSession: () => Promise.resolve(session),
      },
    });

    try {
      await transport.uploadImage(auth.subject, image);
      throw new Error("expected LinkedIn registration failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LinkedInPostImagePreparationError);
      expect(error).toMatchObject({
        stage: "image registration response",
      });
      expect((error as Error).message).not.toContain(
        "private-detail",
      );
    }
    await transport.close();
  });

  test("executes create and readback sources against the observed normalized-included and permalink shapes", async () => {
    const postText = "observed create & permalink shapes";
    const activityId = "7512910091130421248";
    const entityUrn = `urn:li:fsd_update:(urn:li:activity:${activityId},FEED_DETAIL,EMPTY,DEFAULT,false)`;
    const permalink = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
    const profileUrn = "urn:li:fsd_profile:ACoAAExactCurrentProfile";
    const mediaUrn = "urn:li:digitalmediaAsset:C4D22AQExactImage";
    const identityBody = {
      data: {
        plainId: "123456789",
        "*miniProfile": "urn:li:fs_miniProfile:ACoAAExactCurrentProfile",
      },
      included: [{
        entityUrn: "urn:li:fs_miniProfile:ACoAAExactCurrentProfile",
        publicIdentifier: "hraness",
        firstName: "Ben",
        lastName: "Guo",
      }],
    };
    const createBody = {
      data: {},
      included: [
        {
          $type: "com.linkedin.voyager.dash.feed.Update",
          entityUrn,
        },
        {
          $type: "com.linkedin.voyager.dash.contentcreation.Share",
          entityUrn: "urn:li:fsd_share:7512910091130421248",
          status: {
            lifecycleState: {
              UnpublishedState: null,
              "*PublishedState": entityUrn,
            },
          },
        },
      ],
    };
    const permalinkHtml = [
      `<html><body>`,
      `"entityUrn":"urn:li:activity:${activityId}"`,
      `"commentary":{"text":"${postText.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;")}"}`,
      `href="https://www.linkedin.com/in/hraness/"`,
      `<span>Ben Guo</span>`,
      mediaUrn,
      `</body></html>`,
    ].join("");

    const globals = globalThis as Record<string, unknown>;
    const priorFetch = globals.fetch;
    const priorLocation = globals.location;
    const priorDocument = globals.document;
    const jsonResponse = (body: unknown) => ({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type"
            ? "application/vnd.linkedin.normalized+json+2.1"
            : null,
      },
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
    globals.location = { origin: "https://www.linkedin.com" };
    globals.document = { cookie: 'JSESSIONID="ajax:test-csrf-token"' };
    globals.fetch = ((url: unknown, init: unknown) => {
      if (
        init !== null
        && typeof init === "object"
        && (init as { method?: string }).method === "POST"
      ) {
        return Promise.resolve(jsonResponse(createBody));
      }
      if (url === "/voyager/api/me") return Promise.resolve(jsonResponse(identityBody));
      if (url === permalink) {
        return Promise.resolve({
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "text/html" : null,
          },
          status: 200,
          text: () => Promise.resolve(permalinkHtml),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
    }) as typeof fetch;

    let createdUrn = "";
    let read: Readonly<Record<string, unknown>> | null = null;
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: { ok: true } }]);
        }
        if (command?.[0] === "network") return Promise.resolve([pageBindingRecord()]);
        const source = command?.[1] ?? "";
        if (
          !source.includes("const createPath=")
          && !source.includes("LinkedIn post readback permalink")
        ) {
          throw new Error("unexpected LinkedIn evaluation source");
        }
        return (async () => {
          const value = await (new Function(`return ${source}`)() as Promise<unknown>);
          return [browserRecord(value as Readonly<Record<string, unknown>>)];
        })();
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };

    try {
      const transport = await createLinkedInPostBrowserTransport(auth, {
        timeoutMs: 10_000,
        dependencies: { createBrowserSession: () => Promise.resolve(session) },
      });
      const variables = { post: { commentary: { text: postText } } };
      createdUrn = await transport.createPost(
        auth.subject,
        profileUrn,
        variables,
        mediaUrn,
      );
      read = await transport.readPost(
        auth.subject,
        profileUrn,
        variables,
        mediaUrn,
        createdUrn,
      ) as Readonly<Record<string, unknown>>;
      await transport.close();
    } finally {
      globals.fetch = priorFetch as typeof fetch;
      if (priorLocation === undefined) delete globals.location;
      else globals.location = priorLocation;
      if (priorDocument === undefined) delete globals.document;
      else globals.document = priorDocument;
    }

    expect(createdUrn).toBe(entityUrn);
    expect(read).toMatchObject({
      entityMatched: true,
      actorMatched: true,
      textMatched: true,
      mediaMatched: true,
      mediaUrn,
      lifecycle: "PUBLISHED",
      url: permalink,
    });
  });

  test("binds the observed share-only MEDIA_PROCESSING video create response and ugcPost permalink readback", async () => {
    const postText = "observed video create & permalink shapes";
    const ugcPostId = "7512923399980044289";
    const entityUrn = `urn:li:fsd_share:urn:li:ugcPost:${ugcPostId}`;
    const permalink = `https://www.linkedin.com/feed/update/urn:li:ugcPost:${ugcPostId}/`;
    const profileUrn = "urn:li:fsd_profile:ACoAAExactCurrentProfile";
    const mediaUrn = "urn:li:fsd_video:C4D22AQExactVideo";
    const identityBody = {
      data: {
        plainId: "123456789",
        "*miniProfile": "urn:li:fs_miniProfile:ACoAAExactCurrentProfile",
      },
      included: [{
        entityUrn: "urn:li:fs_miniProfile:ACoAAExactCurrentProfile",
        publicIdentifier: "hraness",
        firstName: "Ben",
        lastName: "Guo",
      }],
    };
    const createBody = {
      data: {},
      included: [
        {
          $type: "com.linkedin.voyager.dash.contentcreation.Share",
          entityUrn,
          status: {
            lifecycleState: {
              PublishedState: null,
              UnpublishedState: "MEDIA_PROCESSING",
            },
          },
        },
      ],
    };
    const permalinkHtml = [
      `<html><body>`,
      `"entityUrn":"urn:li:ugcPost:${ugcPostId}"`,
      `"commentary":{"text":"${postText}"}`,
      `href="https://www.linkedin.com/in/hraness/"`,
      `<span>Ben Guo</span>`,
      mediaUrn,
      `</body></html>`,
    ].join("");

    const globals = globalThis as Record<string, unknown>;
    const priorFetch = globals.fetch;
    const priorLocation = globals.location;
    const priorDocument = globals.document;
    const jsonResponse = (body: unknown) => ({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type"
            ? "application/vnd.linkedin.normalized+json+2.1"
            : null,
      },
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
    globals.location = { origin: "https://www.linkedin.com" };
    globals.document = { cookie: 'JSESSIONID="ajax:test-csrf-token"' };
    globals.fetch = ((url: unknown, init: unknown) => {
      if (
        init !== null
        && typeof init === "object"
        && (init as { method?: string }).method === "POST"
      ) {
        return Promise.resolve(jsonResponse(createBody));
      }
      if (url === "/voyager/api/me") return Promise.resolve(jsonResponse(identityBody));
      if (url === permalink) {
        return Promise.resolve({
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "text/html" : null,
          },
          status: 200,
          text: () => Promise.resolve(permalinkHtml),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
    }) as typeof fetch;

    let createdUrn = "";
    let read: Readonly<Record<string, unknown>> | null = null;
    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: { ok: true } }]);
        }
        if (command?.[0] === "network") return Promise.resolve([pageBindingRecord()]);
        const source = command?.[1] ?? "";
        if (
          !source.includes("const createPath=")
          && !source.includes("LinkedIn post readback permalink")
        ) {
          throw new Error("unexpected LinkedIn evaluation source");
        }
        return (async () => {
          const value = await (new Function(`return ${source}`)() as Promise<unknown>);
          return [browserRecord(value as Readonly<Record<string, unknown>>)];
        })();
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };

    try {
      const transport = await createLinkedInPostBrowserTransport(auth, {
        timeoutMs: 10_000,
        dependencies: { createBrowserSession: () => Promise.resolve(session) },
      });
      const variables = { post: { commentary: { text: postText } } };
      createdUrn = await transport.createPost(
        auth.subject,
        profileUrn,
        variables,
        mediaUrn,
        "VIDEO",
      );
      read = await transport.readPost(
        auth.subject,
        profileUrn,
        variables,
        mediaUrn,
        createdUrn,
        "VIDEO",
      ) as Readonly<Record<string, unknown>>;
      await transport.close();
    } finally {
      globals.fetch = priorFetch as typeof fetch;
      if (priorLocation === undefined) delete globals.location;
      else globals.location = priorLocation;
      if (priorDocument === undefined) delete globals.document;
      else globals.document = priorDocument;
    }

    expect(createdUrn).toBe(entityUrn);
    expect(read).toMatchObject({
      entityMatched: true,
      actorMatched: true,
      textMatched: true,
      mediaMatched: true,
      mediaUrn,
      lifecycle: "PUBLISHED",
      url: permalink,
    });
  });

  test("rejects a permalink readback that omits the author's member markers", async () => {
    const postText = "observed permalink without the author";
    const activityId = "7512910091130421248";
    const entityUrn = `urn:li:fsd_update:(urn:li:activity:${activityId},FEED_DETAIL,EMPTY,DEFAULT,false)`;
    const permalink = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
    const profileUrn = "urn:li:fsd_profile:ACoAAExactCurrentProfile";
    const identityBody = {
      data: {
        plainId: "123456789",
        "*miniProfile": "urn:li:fs_miniProfile:ACoAAExactCurrentProfile",
      },
      included: [{
        entityUrn: "urn:li:fs_miniProfile:ACoAAExactCurrentProfile",
        publicIdentifier: "hraness",
        firstName: "Ben",
        lastName: "Guo",
      }],
    };
    const permalinkHtml = [
      `<html><body>`,
      `"entityUrn":"urn:li:activity:${activityId}"`,
      `"commentary":{"text":"${postText}"}`,
      `href="https://www.linkedin.com/in/someone-else/"`,
      `<span>Sam Person</span>`,
      `</body></html>`,
    ].join("");

    const globals = globalThis as Record<string, unknown>;
    const priorFetch = globals.fetch;
    const priorLocation = globals.location;
    const priorDocument = globals.document;
    globals.location = { origin: "https://www.linkedin.com" };
    globals.document = { cookie: 'JSESSIONID="ajax:test-csrf-token"' };
    globals.fetch = ((url: unknown) => {
      if (url === "/voyager/api/me") {
        return Promise.resolve({
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type"
                ? "application/vnd.linkedin.normalized+json+2.1"
                : null,
          },
          status: 200,
          json: () => Promise.resolve(identityBody),
          text: () => Promise.resolve(JSON.stringify(identityBody)),
        });
      }
      if (url === permalink) {
        return Promise.resolve({
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "content-type" ? "text/html" : null,
          },
          status: 200,
          text: () => Promise.resolve(permalinkHtml),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
    }) as typeof fetch;

    const session: BrowserSession = {
      runBatch: (commands) => {
        const command = commands[0];
        if (command?.[0] === "open" || command?.[0] === "wait") {
          return Promise.resolve([{ success: true, result: { ok: true } }]);
        }
        if (command?.[0] === "network") return Promise.resolve([pageBindingRecord()]);
        const source = command?.[1] ?? "";
        if (!source.includes("LinkedIn post readback permalink")) {
          throw new Error("unexpected LinkedIn evaluation source");
        }
        return (async () => {
          const value = await (new Function(`return ${source}`)() as Promise<unknown>);
          return [browserRecord(value as Readonly<Record<string, unknown>>)];
        })();
      },
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
    };

    try {
      const transport = await createLinkedInPostBrowserTransport(auth, {
        timeoutMs: 10_000,
        dependencies: { createBrowserSession: () => Promise.resolve(session) },
      });
      await expect(transport.readPost(
        auth.subject,
        profileUrn,
        { post: { commentary: { text: postText } } },
        null,
        entityUrn,
      )).rejects.toThrow("did not bind the confirmed post");
      await transport.close();
    } finally {
      globals.fetch = priorFetch as typeof fetch;
      if (priorLocation === undefined) delete globals.location;
      else globals.location = priorLocation;
      if (priorDocument === undefined) delete globals.document;
      else globals.document = priorDocument;
    }
  });
});
