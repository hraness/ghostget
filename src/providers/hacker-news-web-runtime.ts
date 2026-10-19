import type { GhostgetAuth } from "../auth";
import type { OperationInput, WebSessionRecipe } from "../model";
import { canonicalJson } from "../canonical-json";
import {
  createWebSessionClient,
  webSessionAuthSubject,
  type WebSessionClient,
  type WebSessionFetch,
  type WebSessionNetworkDependencies,
} from "../web-session-client";
import type {
  WebSessionDispatchEvent,
  WebSessionExecution,
  WebSessionOperationDeadline,
  WebSessionProviderAcceptedMutationTargetEvent,
} from "../web-session-execution";
import {
  HACKER_NEWS_WEB_OPERATION_NAMES,
  HACKER_NEWS_WEB_OPERATIONS,
  authorizeHackerNewsReadRequest,
  dispatchHackerNewsCommentForm,
  dispatchHackerNewsFavoriteAction,
  dispatchHackerNewsSubmissionForm,
  dispatchHackerNewsVoteAction,
  findHackerNewsCommentRow,
  findHackerNewsSubmittedRow,
  normalizeHackerNewsCommentsHtml,
  normalizeHackerNewsFeedHtml,
  normalizeHackerNewsPostHtml,
  parseHackerNewsCommentForm,
  parseHackerNewsFavoritesPresence,
  parseHackerNewsFavoriteAction,
  parseHackerNewsSubmissionForm,
  parseHackerNewsViewerHtml,
  parseHackerNewsVoteAction,
  scanHackerNewsCommentRows,
  type HackerNewsFavoriteAction,
  type HackerNewsVoteAction,
  type HackerNewsWebOperationName,
} from "./hacker-news-web";

const HN_ORIGIN = "https://news.ycombinator.com";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const DEFAULT_FEED_LIMIT = 30;
const DEFAULT_COMMENT_LIMIT = 100;
const MAX_TEXT_BYTES = 2_000;
const READBACK_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;

export type HackerNewsWebRuntimeDependencies = Partial<WebSessionNetworkDependencies> & {
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

function isHackerNewsOperation(value: string): value is HackerNewsWebOperationName {
  return (HACKER_NEWS_WEB_OPERATION_NAMES as readonly string[]).includes(value);
}

function integerInput(
  input: OperationInput,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function itemIdInput(input: OperationInput, name: string): string {
  const value = input[name];
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/u.test(value)) {
    throw new Error(`input.${name} must be a decimal Hacker News item ID`);
  }
  return value;
}

function booleanInput(input: OperationInput, name: string): boolean {
  const value = input[name];
  if (typeof value !== "boolean") throw new Error(`input.${name} must be boolean`);
  return value;
}

function stringInput(input: OperationInput, name: string, maximum: number): string {
  const value = input[name];
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r\n]/u.test(value)
  ) throw new Error(`input.${name} must be a bounded string`);
  return value;
}

function bodyInput(input: OperationInput, name: string, maximum: number): string {
  const value = input[name];
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r]/u.test(value)
  ) throw new Error(`input.${name} must be bounded text`);
  return value;
}

function optionalBodyInput(input: OperationInput, name: string, maximum: number): string | undefined {
  const value = input[name];
  if (value === undefined) return undefined;
  return bodyInput(input, name, maximum);
}

function urlInput(input: OperationInput, name: string): string {
  const value = stringInput(input, name, 4_096);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`input.${name} must be an absolute HTTP URL`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username !== ""
    || url.password !== ""
  ) throw new Error(`input.${name} must be an HTTP URL without credentials`);
  return url.href;
}

function readHeaders(): Readonly<Record<string, string>> {
  return Object.freeze({
    accept: "text/html",
    referer: `${HN_ORIGIN}/`,
  });
}

async function readNews(
  client: WebSessionClient,
  operation: "viewer.current" | "feeds.read",
  maximumBytes: number,
): Promise<string> {
  const url = new URL("/news", HN_ORIGIN);
  authorizeHackerNewsReadRequest({
    operation,
    url,
    method: "GET",
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES),
  });
}

function assertBoundViewer(auth: GhostgetAuth, username: string): string {
  const expected = webSessionAuthSubject(auth);
  if (
    expected === null
    || !/^hacker-news:[A-Za-z0-9_-]{1,64}$/u.test(expected)
  ) {
    throw new Error("Hacker News authenticated operations require an auth locator bound to an exact hacker-news:<username> subject");
  }
  if (`hacker-news:${username}` !== expected) {
    throw new Error("Hacker News browser session viewer no longer matches the confirmed auth subject");
  }
  return expected;
}

export async function probeHackerNewsWebSubject(
  auth: GhostgetAuth,
  options: {
    readonly timeoutMs?: number;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
    readonly signal?: AbortSignal;
  } = {},
): Promise<string> {
  const client = await createWebSessionClient(HN_ORIGIN, auth, {
    timeoutMs: options.timeoutMs ?? 60_000,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const username = parseHackerNewsViewerHtml(await readNews(
    client,
    "viewer.current",
    MAX_HTML_BYTES,
  ));
  return `hacker-news:${username}`;
}

async function readItemPage(
  client: WebSessionClient,
  operation: "posts.read" | "comments.read" | "state.readback",
  itemId: string,
  maximumBytes: number,
): Promise<string> {
  const url = new URL("/item", HN_ORIGIN);
  url.searchParams.set("id", itemId);
  authorizeHackerNewsReadRequest({
    operation,
    url,
    method: "GET",
    targetId: itemId,
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES),
  });
}

async function readReplyFormPage(
  client: WebSessionClient,
  parentId: string,
  maximumBytes: number,
): Promise<string> {
  const url = new URL("/reply", HN_ORIGIN);
  url.searchParams.set("id", parentId);
  url.searchParams.set("goto", `item?id=${parentId}`);
  authorizeHackerNewsReadRequest({
    operation: "reply.form",
    url,
    method: "GET",
    targetId: parentId,
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES),
  });
}

async function readSubmitFormPage(
  client: WebSessionClient,
  maximumBytes: number,
): Promise<string> {
  const url = new URL("/submit", HN_ORIGIN);
  authorizeHackerNewsReadRequest({
    operation: "submit.form",
    url,
    method: "GET",
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES),
  });
}

async function readUserListingPage(
  client: WebSessionClient,
  operation: "favorites.list" | "submitted.list",
  viewer: string,
  maximumBytes: number,
): Promise<string> {
  const url = new URL(operation === "favorites.list" ? "/favorites" : "/submitted", HN_ORIGIN);
  url.searchParams.set("id", viewer);
  authorizeHackerNewsReadRequest({
    operation,
    url,
    method: "GET",
    subject: viewer,
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES),
  });
}

async function boundViewer(
  client: WebSessionClient,
  auth: GhostgetAuth,
  maximumBytes: number,
): Promise<string> {
  const username = parseHackerNewsViewerHtml(await readNews(client, "viewer.current", maximumBytes));
  assertBoundViewer(auth, username);
  return username;
}

function dispatchEvent(
  id: string,
  started: number,
  verified: number,
): WebSessionDispatchEvent {
  return {
    id,
    index: 1,
    progress: { planned: 1, started, verified },
  };
}

function nowSeconds(dependencies: HackerNewsWebRuntimeDependencies | undefined): number {
  return Math.floor((dependencies?.now ?? Date.now)() / 1_000);
}

function sleep(
  dependencies: HackerNewsWebRuntimeDependencies | undefined,
  milliseconds: number,
): Promise<void> {
  return (dependencies?.sleep
    ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(milliseconds);
}

function dispatchOptions(
  recipe: WebSessionRecipe,
  dependencies: HackerNewsWebRuntimeDependencies | undefined,
): { readonly timeoutMs: number; readonly fetch?: WebSessionFetch } {
  return {
    timeoutMs: recipe.timeoutMs,
    ...(dependencies?.fetch === undefined ? {} : { fetch: dependencies.fetch }),
  };
}

export type HackerNewsWebDesiredStatePreparation = Readonly<{
  operation: "content.save" | "reactions.set";
  itemId: string;
  desiredState: boolean;
  actualState: boolean;
  alreadyDesired: boolean;
}>;

export type HackerNewsWebDesiredStateReadback = Readonly<{
  kind: "saved" | "upvoted";
  enabled: boolean;
  itemId: string;
}>;

function desiredStateAction(
  save: boolean,
  pageHtml: string,
  itemId: string,
): {
  readonly action: HackerNewsFavoriteAction | HackerNewsVoteAction;
  readonly actualState: boolean;
} {
  if (save) {
    const action = parseHackerNewsFavoriteAction(pageHtml, itemId);
    return { action, actualState: !action.nextSavedState };
  }
  const action = parseHackerNewsVoteAction(pageHtml, itemId);
  return { action, actualState: !action.nextUpvotedState };
}

/**
 * Perform only the account and exact-target reads that precede a Hacker News
 * desired-state write. The helper never constructs a mutation request or
 * enters the dispatch boundary, so capture-required execution stays inert.
 */
export async function prepareHackerNewsWebDesiredState(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  } = {},
): Promise<HackerNewsWebDesiredStatePreparation> {
  if (
    recipe.site !== "hacker-news"
    || recipe.contractVersion !== 1
    || (recipe.action !== "content.save" && recipe.action !== "reactions.set")
  ) {
    throw new Error(
      "Hacker News desired-state preparation supports only content.save and reactions.set",
    );
  }
  const client = await createWebSessionClient(HN_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  return (await prepareDesiredStateWithClient(client, recipe, input, auth)).preparation;
}

async function prepareDesiredStateWithClient(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
): Promise<{
  readonly viewer: string;
  readonly preparation: HackerNewsWebDesiredStatePreparation;
}> {
  const save = recipe.action === "content.save";
  const itemId = itemIdInput(input, "item_id");
  const desiredState = booleanInput(input, save ? "saved" : "upvoted");
  const viewer = await boundViewer(client, auth, recipe.maxOutputBytes);
  const page = await readItemPage(client, "state.readback", itemId, recipe.maxOutputBytes);
  const { actualState } = desiredStateAction(save, page, itemId);
  return Object.freeze({
    viewer,
    preparation: Object.freeze({
      operation: save ? "content.save" : "reactions.set",
      itemId,
      desiredState,
      actualState,
      alreadyDesired: actualState === desiredState,
    }),
  });
}

/**
 * Independently read one exact Hacker News desired state for reconciliation.
 * Saved state is proven on the account's own /favorites page; upvote state is
 * proven by the request-bound action the item page offers back.
 */
export async function readHackerNewsWebDesiredState(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  } = {},
): Promise<HackerNewsWebDesiredStateReadback> {
  if (
    recipe.site !== "hacker-news"
    || recipe.contractVersion !== 1
    || (recipe.action !== "content.save" && recipe.action !== "reactions.set")
  ) {
    throw new Error(
      "Hacker News desired-state readback supports only content.save and reactions.set",
    );
  }
  const itemId = itemIdInput(input, "item_id");
  const client = await createWebSessionClient(HN_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const viewer = await boundViewer(client, auth, recipe.maxOutputBytes);
  if (recipe.action === "content.save") {
    const present = parseHackerNewsFavoritesPresence(
      await readUserListingPage(client, "favorites.list", viewer, recipe.maxOutputBytes),
      itemId,
    );
    return Object.freeze({ kind: "saved", enabled: present, itemId });
  }
  const { actualState } = desiredStateAction(
    false,
    await readItemPage(client, "state.readback", itemId, recipe.maxOutputBytes),
    itemId,
  );
  return Object.freeze({ kind: "upvoted", enabled: actualState, itemId });
}

async function readbackDesiredState(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  save: boolean,
  viewer: string,
  itemId: string,
): Promise<boolean> {
  if (save) {
    return parseHackerNewsFavoritesPresence(
      await readUserListingPage(client, "favorites.list", viewer, recipe.maxOutputBytes),
      itemId,
    );
  }
  const { actualState } = desiredStateAction(
    false,
    await readItemPage(client, "state.readback", itemId, recipe.maxOutputBytes),
    itemId,
  );
  return actualState;
}

async function executeDesiredState(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  },
): Promise<WebSessionExecution> {
  const save = recipe.action === "content.save";
  const prepared = await prepareDesiredStateWithClient(client, recipe, input, auth);
  const itemId = prepared.preparation.itemId;
  const desiredState = prepared.preparation.desiredState;
  const finalUrl = `${HN_ORIGIN}/item?id=${itemId}`;
  const desired = save ? { saved: desiredState } : { upvoted: desiredState };
  if (prepared.preparation.alreadyDesired) {
    return {
      status: "succeeded",
      output: Object.freeze({
        itemId,
        desired: Object.freeze(desired),
        noOp: true,
        effect: "already-satisfied",
      }),
      finalUrl,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
    };
  }

  let started = 0;
  let verified = 0;
  try {
    // Re-bind the actor and fetch a second, immediately pre-dispatch target
    // page so the request-bound action is fresh and the state cannot drift
    // between preparation and dispatch.
    const rebound = await boundViewer(client, auth, recipe.maxOutputBytes);
    if (rebound !== prepared.viewer) {
      throw new Error("Hacker News viewer changed during desired-state preparation");
    }
    const freshPage = await readItemPage(client, "state.readback", itemId, recipe.maxOutputBytes);
    const fresh = desiredStateAction(save, freshPage, itemId);
    if (fresh.actualState === desiredState) {
      return {
        status: "succeeded",
        output: Object.freeze({
          itemId,
          desired: Object.freeze(desired),
          noOp: true,
          effect: "already-satisfied",
        }),
        finalUrl,
        dispatchStarted: false,
        dispatch: { planned: 1, started: 0, verified: 0 },
      };
    }
    const beforeRequest = async (): Promise<void> => {
      await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
      started = 1;
    };
    if (save) {
      await dispatchHackerNewsFavoriteAction(
        client,
        fresh.action as HackerNewsFavoriteAction,
        desiredState,
        beforeRequest,
        dispatchOptions(recipe, options.dependencies),
      );
    } else {
      await dispatchHackerNewsVoteAction(
        client,
        fresh.action as HackerNewsVoteAction,
        desiredState,
        beforeRequest,
        dispatchOptions(recipe, options.dependencies),
      );
    }
    let after = await readbackDesiredState(client, recipe, save, prepared.viewer, itemId);
    for (const delay of READBACK_DELAYS_MS) {
      if (after === desiredState) break;
      await sleep(options.dependencies, delay);
      after = await readbackDesiredState(client, recipe, save, prepared.viewer, itemId);
    }
    if (after !== desiredState) {
      throw new Error("Hacker News desired-state readback did not match the confirmed state");
    }
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({
        itemId,
        desired: Object.freeze(desired),
        noOp: false,
        previouslyDesired: false,
      }),
      finalUrl,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? "Hacker News may have changed the requested state but exact readback was not verified; reconcile before retrying"
        : "Hacker News desired-state dispatch failed before submission",
    };
  }
}

async function executeCommentCreate(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  },
): Promise<WebSessionExecution> {
  const reply = recipe.action === "replies.create";
  const parentId = itemIdInput(input, reply ? "parent_id" : "post_id");
  const body = bodyInput(input, "body", MAX_TEXT_BYTES);
  const viewer = await boundViewer(client, auth, recipe.maxOutputBytes);
  const formPage = reply
    ? await readReplyFormPage(client, parentId, recipe.maxOutputBytes)
    : await readItemPage(client, "state.readback", parentId, recipe.maxOutputBytes);
  parseHackerNewsCommentForm(formPage, parentId);
  const referer = reply
    ? `${HN_ORIGIN}/reply?id=${parentId}&goto=${encodeURIComponent(`item?id=${parentId}`)}`
    : `${HN_ORIGIN}/item?id=${parentId}`;
  const finalUrl = `${HN_ORIGIN}/item?id=${parentId}`;

  let started = 0;
  let verified = 0;
  try {
    const rebound = await boundViewer(client, auth, recipe.maxOutputBytes);
    if (rebound !== viewer) {
      throw new Error("Hacker News viewer changed during comment preparation");
    }
    const freshPage = reply
      ? await readReplyFormPage(client, parentId, recipe.maxOutputBytes)
      : await readItemPage(client, "state.readback", parentId, recipe.maxOutputBytes);
    const proof = parseHackerNewsCommentForm(freshPage, parentId);
    const notBeforeSeconds = nowSeconds(options.dependencies);
    await dispatchHackerNewsCommentForm(
      client,
      proof,
      { text: body, referer },
      async (): Promise<void> => {
        await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
        started = 1;
      },
      dispatchOptions(recipe, options.dependencies),
    );
    const expected = {
      parentId,
      author: viewer,
      body,
      notBeforeSeconds,
      nowSeconds: 0,
    };
    let comment = findHackerNewsCommentRow(
      scanHackerNewsCommentRows(
        await readItemPage(client, "state.readback", parentId, recipe.maxOutputBytes),
        parentId,
      ),
      { ...expected, nowSeconds: nowSeconds(options.dependencies) },
    );
    for (const delay of READBACK_DELAYS_MS) {
      if (comment !== null) break;
      await sleep(options.dependencies, delay);
      comment = findHackerNewsCommentRow(
        scanHackerNewsCommentRows(
          await readItemPage(client, "state.readback", parentId, recipe.maxOutputBytes),
          parentId,
        ),
        { ...expected, nowSeconds: nowSeconds(options.dependencies) },
      );
    }
    if (comment === null) {
      throw new Error("Hacker News comment readback did not return the confirmed comment");
    }
    await options.afterProviderAcceptedMutationTarget?.({
      id: recipe.action,
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({ commentId: comment.id }),
      },
    });
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({
        id: comment.id,
        parentId: comment.parentId,
        author: viewer,
        body: comment.body,
        createdAt: comment.createdAt,
      }),
      finalUrl: `${HN_ORIGIN}/item?id=${comment.id}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? "Hacker News may have created the confirmed comment but exact readback was not verified; reconcile before retrying"
        : "Hacker News comment dispatch failed before submission",
    };
  }
}

async function executePostPublish(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  },
): Promise<WebSessionExecution> {
  const title = stringInput(input, "title", 80);
  const url = optionalBodyInput(input, "url", 4_096) === undefined
    ? undefined
    : urlInput(input, "url");
  const body = optionalBodyInput(input, "body", MAX_TEXT_BYTES);
  if ((url === undefined) === (body === undefined)) {
    throw new Error("input must contain exactly one of url or body");
  }
  const viewer = await boundViewer(client, auth, recipe.maxOutputBytes);
  parseHackerNewsSubmissionForm(await readSubmitFormPage(client, recipe.maxOutputBytes));
  const finalUrl = `${HN_ORIGIN}/submitted?id=${encodeURIComponent(viewer)}`;

  let started = 0;
  let verified = 0;
  try {
    const rebound = await boundViewer(client, auth, recipe.maxOutputBytes);
    if (rebound !== viewer) {
      throw new Error("Hacker News viewer changed during submission preparation");
    }
    const proof = parseHackerNewsSubmissionForm(
      await readSubmitFormPage(client, recipe.maxOutputBytes),
    );
    const notBeforeSeconds = nowSeconds(options.dependencies);
    await dispatchHackerNewsSubmissionForm(
      client,
      proof,
      { title, url: url ?? null, text: body ?? null },
      async (): Promise<void> => {
        await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
        started = 1;
      },
      dispatchOptions(recipe, options.dependencies),
    );
    const expected = {
      author: viewer,
      title,
      url: url ?? null,
      notBeforeSeconds,
      nowSeconds: 0,
    };
    let post = findHackerNewsSubmittedRow(
      await readUserListingPage(client, "submitted.list", viewer, recipe.maxOutputBytes),
      { ...expected, nowSeconds: nowSeconds(options.dependencies) },
    );
    for (const delay of READBACK_DELAYS_MS) {
      if (post !== null) break;
      await sleep(options.dependencies, delay);
      post = findHackerNewsSubmittedRow(
        await readUserListingPage(client, "submitted.list", viewer, recipe.maxOutputBytes),
        { ...expected, nowSeconds: nowSeconds(options.dependencies) },
      );
    }
    if (post === null) {
      throw new Error("Hacker News submitted readback did not return the confirmed post");
    }
    await options.afterProviderAcceptedMutationTarget?.({
      id: recipe.action,
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({ postId: post.id }),
      },
    });
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({
        id: post.id,
        title: post.title,
        url: post.url,
        author: viewer,
        createdAt: post.createdAt,
      }),
      finalUrl: `${HN_ORIGIN}/item?id=${post.id}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? "Hacker News may have published the confirmed submission but exact readback was not verified; reconcile before retrying"
        : "Hacker News submission dispatch failed before submission",
    };
  }
}

/**
 * Independently discover the confirmed comment on its exact parent page for
 * reconciliation. Hacker News never echoes a comment target identifier, so
 * presence is proven by the one row exactly binding parent, actor, and body;
 * an ambiguous page fails closed.
 */
export async function readHackerNewsWebPublishedCommentPresence(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  } = {},
): Promise<Readonly<{ present: boolean }>> {
  const reply = recipe.action === "replies.create";
  if (
    recipe.site !== "hacker-news"
    || recipe.contractVersion !== 1
    || (recipe.action !== "comments.create" && !reply)
  ) {
    throw new Error(
      "Hacker News comment recovery supports only comments.create and replies.create",
    );
  }
  const parentId = itemIdInput(input, reply ? "parent_id" : "post_id");
  const body = bodyInput(input, "body", MAX_TEXT_BYTES);
  const client = await createWebSessionClient(HN_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const viewer = await boundViewer(client, auth, recipe.maxOutputBytes);
  const rows = scanHackerNewsCommentRows(
    await readItemPage(client, "state.readback", parentId, recipe.maxOutputBytes),
    parentId,
  );
  const matches = rows.filter((comment) =>
    comment.parentId === parentId
    && comment.author === viewer
    && comment.body === body);
  if (matches.length > 1) {
    throw new Error("Hacker News reconciliation found ambiguous matching comments");
  }
  return Object.freeze({ present: matches.length === 1 });
}

/**
 * Independently discover the confirmed submission on the bound account's
 * /submitted listing for reconciliation. Hacker News never echoes a
 * submission target identifier, so presence is proven by the one row exactly
 * binding actor, provider-canonicalized title, and link or text shape; an
 * ambiguous listing fails closed.
 */
export async function readHackerNewsWebPublishedPostPresence(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  } = {},
): Promise<Readonly<{ present: boolean }>> {
  if (
    recipe.site !== "hacker-news"
    || recipe.contractVersion !== 1
    || recipe.action !== "posts.publish"
  ) {
    throw new Error("Hacker News submission recovery supports only posts.publish");
  }
  const title = stringInput(input, "title", 80);
  const url = optionalBodyInput(input, "url", 4_096) === undefined
    ? undefined
    : urlInput(input, "url");
  const body = optionalBodyInput(input, "body", MAX_TEXT_BYTES);
  if ((url === undefined) === (body === undefined)) {
    throw new Error("input must contain exactly one of url or body");
  }
  const client = await createWebSessionClient(HN_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const viewer = await boundViewer(client, auth, recipe.maxOutputBytes);
  const post = findHackerNewsSubmittedRow(
    await readUserListingPage(
      client,
      "submitted.list",
      viewer,
      recipe.maxOutputBytes,
    ),
    {
      author: viewer,
      title,
      url: url ?? null,
      notBeforeSeconds: 0,
      nowSeconds: nowSeconds(options.dependencies),
    },
  );
  return Object.freeze({ present: post !== null });
}

export async function executeHackerNewsWebOperation(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly dependencies?: HackerNewsWebRuntimeDependencies;
  } = {},
): Promise<WebSessionExecution> {
  if (
    recipe.site !== "hacker-news"
    || recipe.contractVersion !== 1
    || !isHackerNewsOperation(recipe.action)
  ) throw new Error("Hacker News authenticated web recipe is not installed");
  const contract = HACKER_NEWS_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(`Hacker News authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  if (
    recipe.action !== "feeds.read"
    && recipe.action !== "posts.read"
    && recipe.action !== "comments.read"
    && recipe.action !== "content.save"
    && recipe.action !== "reactions.set"
    && recipe.action !== "comments.create"
    && recipe.action !== "replies.create"
    && recipe.action !== "posts.publish"
  ) throw new Error(`Hacker News authenticated web operation ${recipe.action} has no executable reviewed contract`);

  const client = await createWebSessionClient(HN_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  if (recipe.action === "content.save" || recipe.action === "reactions.set") {
    void options.afterProviderAcceptedMutationTarget;
    return executeDesiredState(client, recipe, input, auth, options);
  }
  if (recipe.action === "comments.create" || recipe.action === "replies.create") {
    return executeCommentCreate(client, recipe, input, auth, options);
  }
  if (recipe.action === "posts.publish") {
    return executePostPublish(client, recipe, input, auth, options);
  }
  const newsHtml = await readNews(
    client,
    recipe.action === "feeds.read" ? "feeds.read" : "viewer.current",
    recipe.maxOutputBytes,
  );
  assertBoundViewer(auth, parseHackerNewsViewerHtml(newsHtml));
  // R1 operations never enter the mutation dispatch ledger.
  void options.beforeDispatch;
  void options.afterProviderAcceptedMutationTarget;
  void options.afterDispatchVerified;

  if (recipe.action === "feeds.read") {
    if (input.feed !== "news") throw new Error("input.feed must be the observed Hacker News news feed");
    const limit = integerInput(input, "limit", DEFAULT_FEED_LIMIT, 1, 30);
    return {
      status: "succeeded",
      output: normalizeHackerNewsFeedHtml(newsHtml, limit),
      finalUrl: `${HN_ORIGIN}/news`,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 },
    };
  }

  const idName = recipe.action === "posts.read" ? "item_id" : "post_id";
  const targetId = itemIdInput(input, idName);
  const itemHtml = await readItemPage(
    client,
    recipe.action,
    targetId,
    recipe.maxOutputBytes,
  );
  const output = recipe.action === "posts.read"
    ? normalizeHackerNewsPostHtml(itemHtml, targetId)
    : normalizeHackerNewsCommentsHtml(
        itemHtml,
        targetId,
        integerInput(input, "limit", DEFAULT_COMMENT_LIMIT, 1, 100),
      );
  return {
    status: "succeeded",
    output,
    finalUrl: `${HN_ORIGIN}/item?id=${targetId}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 },
  };
}
